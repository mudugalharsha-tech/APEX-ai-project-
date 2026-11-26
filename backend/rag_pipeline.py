import os
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
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Load backend/.env first; fall back to workspace root .env if needed
BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")
os.environ.setdefault("USER_AGENT", "AuraRAG/1.0")

COLLECTION_NAME = "rag_documents"


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

        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
        )
        self.vector_store = self._init_vector_store()

    def _init_vector_store(self) -> Chroma:
        return Chroma(
            collection_name=COLLECTION_NAME,
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
        self, docs: List[Document], source_name: str, source_type: str
    ) -> Dict[str, Any]:
        """Split documents into chunks, attach source metadata, and store in Chroma."""
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

        self.vector_store.add_documents(chunks)
        return {
            "id": source_id,
            "name": source_name,
            "type": source_type,
            "chunks_added": len(chunks),
        }

    def ingest_file(self, file_path: str, original_filename: str) -> Dict[str, Any]:
        """Load, chunk, and index an uploaded file."""
        docs, file_type = self._load_file_documents(file_path, original_filename)
        return self._ingest_documents(docs, original_filename, file_type)

    def ingest_url(self, url: str) -> Dict[str, Any]:
        """Load, chunk, and index a Web URL or YouTube link."""
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Invalid URL. Please provide a valid http:// or https:// URL.")

        if is_youtube_url(url):
            loader = YoutubeLoader.from_youtube_url(url, add_video_info=False)
            docs = loader.load()
            source_type = "youtube"
        else:
            loader = WebBaseLoader(web_paths=[url])
            docs = loader.load()
            source_type = "web"

        return self._ingest_documents(docs, url, source_type)

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
        chat_history: Optional[List[Any]] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run history-aware retrieval and return the AI answer with deduplicated sources."""
        llm = self.get_llm(api_key=api_key, model=model)
        retriever = self.vector_store.as_retriever(search_kwargs={"k": 4})

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
        history_aware_retriever = create_history_aware_retriever(
            llm, retriever, contextualize_q_prompt
        )

        qa_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a helpful, knowledgeable AI assistant. You have access to retrieved "
                    "context from the user's uploaded knowledge base below.\n"
                    "- If the retrieved context is relevant to the user's question, use it to "
                    "ground your answer accurately.\n"
                    "- If the question is general or not covered by the retrieved context, answer "
                    "naturally and helpfully using your general knowledge. Do NOT refuse to answer "
                    "or say you don't know just because the topic is not in the uploaded sources.\n\n"
                    "{context}",
                ),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
        rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

        formatted_history = self._format_chat_history(chat_history)
        result = rag_chain.invoke({"input": question, "chat_history": formatted_history})

        sources: List[str] = []
        seen = set()
        for doc in result.get("context", []):
            src = (doc.metadata or {}).get("source")
            if src and src not in seen:
                seen.add(src)
                sources.append(src)

        return {
            "answer": result.get("answer", ""),
            "sources": sources,
        }

    def chat(
        self,
        question: str,
        chat_history: Optional[List[Any]] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.query_rag(
            question=question,
            chat_history=chat_history,
            api_key=api_key,
            model=model,
        )

    def reset(self) -> None:
        """Clear all indexed documents from the Chroma vector store."""
        try:
            self.vector_store.delete_collection()
        except Exception:
            pass
        self.vector_store = self._init_vector_store()
