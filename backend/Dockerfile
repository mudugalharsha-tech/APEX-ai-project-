FROM python:3.11-slim

WORKDIR /app

# Writable cache & ChromaDB paths for Hugging Face Spaces runtime
ENV PYTHONUNBUFFERED=1 \
    TORCH_HOME=/tmp/torch \
    SENTENCE_TRANSFORMERS_HOME=/tmp/sentence_transformers \
    HF_HOME=/tmp/huggingface \
    CHROMA_PERSIST_DIR=/tmp/chroma_db \
    USER_AGENT=AuraRAG/1.0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
