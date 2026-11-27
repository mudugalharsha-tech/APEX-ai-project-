import hashlib
import ipaddress
import os
import re
import socket
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import pandas as pd
from dotenv import load_dotenv
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_chroma import Chroma
from langchain_community.document_loaders import (
    CSVLoader,
    Docx2txtLoader,
    PyPDFLoader,
    TextLoader,
    WebBaseLoader,
    YoutubeLoader,
)
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter


class ONNXMiniLMEmbeddings(Embeddings):
    """Lightweight ONNX all-MiniLM-L6-v2 embeddings (~180MB RAM, no PyTorch required)."""

    def __init__(self) -> None:
        self._ef = DefaultEmbeddingFunction()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [[float(x) for x in vec] for vec in self._ef(texts)]

    def embed_query(self, text: str) -> List[float]:
        return [float(x) for x in self._ef([text])[0]]

# Load backend/.env first; fall back to workspace root .env if needed
BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")
os.environ.setdefault("USER_AGENT", "AuraRAG/1.0")

COLLECTION_PREFIX = "dev_"
DEVICE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{16,64}$")


def get_device_collection_name(device_id: str, device_secret: str) -> str:
    """Derive an isolated, unguessable Chroma collection name per device."""
    if not device_id or not DEVICE_ID_RE.match(device_id):
        raise ValueError("Invalid or missing X-Device-ID header.")
    if not device_secret or len(device_secret.strip()) < 32:
        raise ValueError("Invalid or missing X-Device-Secret header.")
    digest = hashlib.sha256(f"{device_id}:{device_secret.strip()}".encode("utf-8")).hexdigest()
    return f"{COLLECTION_PREFIX}{digest[:32]}"


class MissingAPIKeyError(Exception):
    """Raised when no OpenRouter API key is provided in the request or .env."""


def _resolve_api_key(override_key: Optional[str] = None) -> str:
    """Resolve OpenRouter API key from request override or environment variables."""
    if override_key and override_key.strip():
        return override_key.strip()

    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if key and key != "your_key_here":
        return key

    fallback = os.getenv("OPEN_ROUTER_API_KEY", "").strip()
    if fallback and fallback != "your_key_here":
        return fallback

    raise MissingAPIKeyError(
        "OpenRouter API key is required. Please enter your API key in Settings or backend/.env."
    )


def is_youtube_url(url: str) -> bool:
    """Return True if the URL points to YouTube."""
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    return any(domain in host for domain in ("youtube.com", "youtu.be", "www.youtube.com", "m.youtube.com"))


class RAGPipeline:
    """Multi-format RAG pipeline backed by Chroma, HuggingFaceEmbeddings, and OpenRouter."""

    def __init__(self) -> None:
        self.model_name = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
        persist_path = Path(persist_dir)
        if not persist_path.is_absolute():
            persist_path = BACKEND_DIR / persist_path
        persist_path.mkdir(parents=True, exist_ok=True)
        self.persist_dir = str(persist_path)

        self.embeddings = ONNXMiniLMEmbeddings()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
        )

    def _get_vector_store(self, device_id: str, device_secret: str) -> Chroma:
        """Return the isolated Chroma collection for the given device credentials."""
        collection_name = get_device_collection_name(device_id, device_secret)
        return Chroma(
            collection_name=collection_name,
            embedding_function=self.embeddings,
            persist_directory=self.persist_dir,
        )

    def get_llm(
        self, api_key: Optional[str] = None, model: Optional[str] = None
    ) -> ChatOpenAI:
        resolved_key = _resolve_api_key(api_key)
        resolved_model = (model or "").strip() or self.model_name
        return ChatOpenAI(
            model=resolved_model,
            api_key=resolved_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=0.2,
        )

    def _load_excel_documents(self, file_path: str, source_name: str) -> List[Document]:
        """Load each sheet of an Excel workbook into a LangChain Document."""
        sheets = pd.read_excel(file_path, sheet_name=None)
        docs: List[Document] = []
        for sheet_name, df in sheets.items():
            if df.empty:
                continue
            content = f"Sheet: {sheet_name}\n{df.to_csv(index=False)}"
            docs.append(
                Document(
                    page_content=content,
                    metadata={"source": source_name, "sheet": str(sheet_name)},
                )
            )
        return docs

    def _load_file_documents(self, file_path: str, original_filename: str) -> Tuple[List[Document], str]:
        """Select the appropriate loader based on file extension."""
        ext = Path(original_filename).suffix.lower()
        if ext == ".pdf":
            loader = PyPDFLoader(file_path)
            docs = loader.load()
            file_type = "pdf"
        elif ext == ".docx":
            loader = Docx2txtLoader(file_path)
            docs = loader.load()
            file_type = "docx"
        elif ext == ".txt":
            loader = TextLoader(file_path, encoding="utf-8")
            docs = loader.load()
            file_type = "txt"
        elif ext == ".csv":
            loader = CSVLoader(file_path, encoding="utf-8")
            docs = loader.load()
            file_type = "csv"
        elif ext in (".xlsx", ".xls"):
            docs = self._load_excel_documents(file_path, original_filename)
            file_type = ext.lstrip(".")
        else:
            raise ValueError(
                f"Unsupported file format '{ext}'. Supported: .pdf, .docx, .txt, .csv, .xlsx, .xls"
            )
        return docs, file_type

    def _ingest_documents(
        self,
        docs: List[Document],
        source_name: str,
        source_type: str,
        device_id: str,
        device_secret: str,
    ) -> Dict[str, Any]:
        """Split documents into chunks, attach source metadata, and store in device's Chroma."""
        vector_store = self._get_vector_store(device_id, device_secret)
        source_id = str(uuid.uuid4())
        for doc in docs:
            doc.metadata = {
                **(doc.metadata or {}),
                "source": source_name,
                "source_id": source_id,
                "source_type": source_type,
            }

        chunks = self.text_splitter.split_documents(docs)
        if not chunks:
            raise ValueError(f"No extractable text found in '{source_name}'.")

        vector_store.add_documents(chunks)
        return {
            "id": source_id,
            "name": source_name,
            "type": source_type,
            "chunks_added": len(chunks),
        }

    def ingest_file(
        self,
        file_path: str,
        original_filename: str,
        device_id: str,
        device_secret: str,
    ) -> Dict[str, Any]:
        """Load, chunk, and index an uploaded file for a specific device."""
        docs, file_type = self._load_file_documents(file_path, original_filename)
        return self._ingest_documents(docs, original_filename, file_type, device_id, device_secret)

    def ingest_url(self, url: str, device_id: str, device_secret: str) -> Dict[str, Any]:
        """Load, chunk, and index a Web URL or YouTube link (with SSRF protection)."""
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Invalid URL. Please provide a valid http:// or https:// URL.")

        hostname = (parsed.hostname or "").lower()
        if not hostname or hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or hostname.endswith((".local", ".internal")):
            raise ValueError("Private or local network URLs are not allowed.")

        try:
            resolved_ip = socket.gethostbyname(hostname)
            ip_obj = ipaddress.ip_address(resolved_ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
                raise ValueError("Private or internal IP addresses are not allowed.")
        except socket.gaierror:
            pass

        if is_youtube_url(url):
            loader = YoutubeLoader.from_youtube_url(url, add_video_info=False)
            docs = loader.load()
            source_type = "youtube"
        else:
            loader = WebBaseLoader(web_paths=[url])
            docs = loader.load()
            source_type = "web"

        return self._ingest_documents(docs, url, source_type, device_id, device_secret)

    def _format_chat_history(self, chat_history: Optional[List[Any]]) -> List[Any]:
        """Normalize incoming chat history into LangChain HumanMessage / AIMessage objects."""
        formatted: List[Any] = []
        if not chat_history:
            return formatted

        for item in chat_history:
            if isinstance(item, dict):
                role = (item.get("role") or "").lower()
                content = item.get("content") or ""
                if role in ("user", "human"):
                    formatted.append(HumanMessage(content=content))
                elif role in ("assistant", "ai", "bot"):
                    formatted.append(AIMessage(content=content))
            elif isinstance(item, (list, tuple)) and len(item) == 2:
                formatted.append(HumanMessage(content=str(item[0])))
                formatted.append(AIMessage(content=str(item[1])))
        return formatted

    def query_rag(
        self,
        question: str,
        device_id: str,
        device_secret: str,
        chat_history: Optional[List[Any]] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        response_style: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run history-aware retrieval on this device's isolated collection and return telemetry."""
        total_start = time.perf_counter()
        vector_store = self._get_vector_store(device_id, device_secret)
        resolved_model = (model or "").strip() or self.model_name
        llm = self.get_llm(api_key=api_key, model=resolved_model)
        formatted_history = self._format_chat_history(chat_history)

        style_instructions = {
            "tailored": (
                "Tailor your response to the user's exact intent: lead with a clear, direct answer, "
                "use clean Markdown headings or bullet points where helpful, highlight key terms in **bold**, "
                "and avoid generic filler."
            ),
            "concise": (
                "Be ultra-concise and direct. Give the core answer in 2-4 crisp sentences or short bullets "
                "with zero fluff."
            ),
            "detailed": (
                "Provide a thorough, well-structured deep dive with clear section headings, examples, "
                "step-by-step reasoning, and a brief summary."
            ),
            "bullets": (
                "Format your entire response as scannable, high-signal bullet points grouped by topic "
                "with bold lead-ins."
            ),
            "technical": (
                "Adopt a senior-engineer technical tone: include precise terminology, architecture/code "
                "details, edge cases, and concrete implementation steps."
            ),
        }
        chosen_style = (response_style or "tailored").strip().lower()
        style_guide = style_instructions.get(chosen_style, style_instructions["tailored"])

        # Step 1: History-aware query reformulation
        if formatted_history:
            contextualize_q_prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "Given a chat history and the latest user question which might reference "
                        "context in the chat history, formulate a standalone question which can be "
                        "understood without the chat history. Do NOT answer the question, just "
                        "reformulate it if needed and otherwise return it as is.",
                    ),
                    MessagesPlaceholder("chat_history"),
                    ("human", "{input}"),
                ]
            )
            reformulate_msg = (contextualize_q_prompt | llm).invoke(
                {"input": question, "chat_history": formatted_history}
            )
            reformulated_query = (
                reformulate_msg.content.strip()
                if isinstance(reformulate_msg.content, str) and reformulate_msg.content.strip()
                else question
            )
        else:
            reformulated_query = question

        # Step 2: Check device's vector store count & filter by 0.35 similarity threshold
        RELEVANCE_THRESHOLD = 0.35
        doc_count = 0
        raw_results: List[Tuple[Document, float]] = []
        try:
            doc_count = vector_store._collection.count()
            if doc_count > 0:
                raw_results = vector_store.similarity_search_with_relevance_scores(
                    reformulated_query, k=4
                )
        except Exception:
            raw_results = []

        retrieved_chunks: List[Dict[str, Any]] = []
        sources: List[str] = []
        seen_sources = set()

        for doc, score in raw_results:
            clamped_score = max(0.0, min(1.0, float(score)))
            if clamped_score < RELEVANCE_THRESHOLD:
                continue

            meta = doc.metadata or {}
            src = meta.get("source") or "Unknown"
            if src not in seen_sources:
                seen_sources.add(src)
                sources.append(src)

            page_or_sheet = None
            if meta.get("page") is not None:
                try:
                    page_or_sheet = f"Page {int(meta['page']) + 1}"
                except (ValueError, TypeError):
                    page_or_sheet = f"Page {meta['page']}"
            elif meta.get("sheet"):
                page_or_sheet = f"Sheet: {meta['sheet']}"

            retrieved_chunks.append(
                {
                    "chunk_index": len(retrieved_chunks) + 1,
                    "source": src,
                    "page_or_sheet": page_or_sheet,
                    "content": doc.page_content,
                    "similarity_score": round(clamped_score, 4),
                    "match_percent": round(clamped_score * 100, 1),
                }
            )

        # Step 3: Hybrid Execution Path (RAG_GROUNDED vs LLM_GENERAL_KNOWLEDGE)
        if retrieved_chunks:
            answer_mode = "RAG_GROUNDED"
            mode_reason = (
                f"Matched {len(retrieved_chunks)} chunk"
                f"{'s' if len(retrieved_chunks) != 1 else ''} above 35% similarity threshold"
            )
            context_text = "\n\n".join(c["content"] for c in retrieved_chunks)
            system_instructions = (
                "You are a helpful AI assistant. Answer the user's question primarily using the "
                "retrieved context below. If the context only partially answers the question, you "
                "may supplement it with your general knowledge, clearly distinguishing what came "
                "from the uploaded sources.\n"
                f"- Response Style Directive: {style_guide}"
            )
            qa_prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", f"{system_instructions}\n\nRetrieved Context:\n{{context}}"),
                    MessagesPlaceholder("chat_history"),
                    ("human", "{input}"),
                ]
            )
            prompt_inputs = {
                "context": context_text,
                "chat_history": formatted_history,
                "input": question,
            }
        else:
            answer_mode = "LLM_GENERAL_KNOWLEDGE"
            mode_reason = (
                "Knowledge base is empty — used LLM pre-trained weights"
                if doc_count == 0
                else "No chunks met the 35% similarity threshold — used LLM pre-trained weights"
            )
            context_text = ""
            system_instructions = (
                "You are a helpful AI assistant. No relevant uploaded documents were found for "
                "this query, so answer directly using your own pre-trained knowledge.\n"
                f"- Response Style Directive: {style_guide}"
            )
            qa_prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_instructions),
                    MessagesPlaceholder("chat_history"),
                    ("human", "{input}"),
                ]
            )
            prompt_inputs = {
                "chat_history": formatted_history,
                "input": question,
            }

        llm_start = time.perf_counter()
        prompt_value = qa_prompt.invoke(prompt_inputs)
        ai_message = llm.invoke(prompt_value)
        llm_duration_ms = round((time.perf_counter() - llm_start) * 1000)
        total_duration_ms = round((time.perf_counter() - total_start) * 1000)

        answer_text = (
            ai_message.content
            if isinstance(ai_message.content, str)
            else str(ai_message.content)
        )

        # Extract token usage from AIMessage.usage_metadata or response_metadata
        usage = getattr(ai_message, "usage_metadata", None) or {}
        resp_meta = getattr(ai_message, "response_metadata", None) or {}
        token_usage = resp_meta.get("token_usage") or {}

        approx_system = max(1, len(system_instructions) // 4)
        approx_context = len(context_text) // 4
        approx_history_q = max(
            1,
            (len(question) + sum(len(str(m.content)) for m in formatted_history)) // 4,
        )

        input_tokens = (
            usage.get("input_tokens")
            or token_usage.get("prompt_tokens")
            or (approx_system + approx_context + approx_history_q)
        )
        output_tokens = (
            usage.get("output_tokens")
            or token_usage.get("completion_tokens")
            or max(1, len(answer_text) // 4)
        )
        total_tokens = (
            usage.get("total_tokens")
            or token_usage.get("total_tokens")
            or (input_tokens + output_tokens)
        )

        telemetry = {
            "answer_mode": answer_mode,
            "mode_reason": mode_reason,
            "raw_query": question,
            "reformulated_query": reformulated_query,
            "was_reformulated": reformulated_query.strip() != question.strip(),
            "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
            "llm_model": resolved_model,
            "response_style": chosen_style,
            "llm_duration_ms": llm_duration_ms,
            "total_duration_ms": total_duration_ms,
            "retrieved_chunks": retrieved_chunks,
            "tokens": {
                "input_tokens": int(input_tokens),
                "output_tokens": int(output_tokens),
                "total_tokens": int(total_tokens),
                "breakdown": {
                    "system_tokens": approx_system,
                    "context_tokens": approx_context,
                    "history_question_tokens": approx_history_q,
                },
            },
            "prompt_anatomy": {
                "system_prompt": system_instructions,
                "context_block": context_text or "(Skipped — Base LLM Knowledge mode)",
                "history_messages_count": len(formatted_history),
                "user_question": question,
            },
        }

        return {
            "answer": answer_text,
            "sources": sources,
            "answer_mode": answer_mode,
            "mode_reason": mode_reason,
            "telemetry": telemetry,
        }

    def chat(
        self,
        question: str,
        device_id: str,
        device_secret: str,
        chat_history: Optional[List[Any]] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        response_style: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.query_rag(
            question=question,
            device_id=device_id,
            device_secret=device_secret,
            chat_history=chat_history,
            api_key=api_key,
            model=model,
            response_style=response_style,
        )

    def reset(self, device_id: str, device_secret: str) -> None:
        """Clear all indexed documents for this device's isolated Chroma collection."""
        vector_store = self._get_vector_store(device_id, device_secret)
        try:
            vector_store.delete_collection()
        except Exception:
            pass
