FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY api ./api
# pipeline/config/ e schemas/ sao lidos em runtime (load_config/load_schema)
COPY pipeline/config ./pipeline/config
COPY pipeline/schemas ./pipeline/schemas

RUN pip install --no-cache-dir -e ".[api]"

EXPOSE 8000

# Sem alembic no v1 - Base.metadata.create_all no boot (ver api/app/main.py).
CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
