import os
import gradio as gr
import uvicorn

# Ensure writable cache & ChromaDB paths in Hugging Face Spaces
os.environ.setdefault("TORCH_HOME", "/tmp/torch")
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", "/tmp/sentence_transformers")
os.environ.setdefault("HF_HOME", "/tmp/huggingface")
os.environ.setdefault("CHROMA_PERSIST_DIR", "/tmp/chroma_db")
os.environ.setdefault("USER_AGENT", "AuraRAG/1.0")

from main import app as fastapi_app  # noqa: E402

with gr.Blocks(title="AURA RAG Backend") as demo:
    gr.Markdown(
        "# AURA RAG FastAPI Backend\n"
        "The FastAPI RAG & LangChain X-Ray API is running.\n\n"
        "- Health check: `/`\n"
        "- API docs: `/docs`"
    )

app = gr.mount_gradio_app(fastapi_app, demo, path="/ui")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
