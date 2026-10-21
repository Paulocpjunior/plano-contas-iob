FROM python:3.13-slim
WORKDIR /app
COPY backup_unas/requirements.lock /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home replica
COPY backup_unas /app/backup_unas
USER replica
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UNAS_ENABLE_TRANSFERS=false
ENTRYPOINT ["python", "-m", "backup_unas.worker"]
