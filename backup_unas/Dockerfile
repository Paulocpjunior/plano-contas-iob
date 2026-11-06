FROM golang:1.25.6-bookworm AS wireguard
WORKDIR /src
COPY backup_unas/wireguard/go.mod backup_unas/wireguard/go.sum ./
RUN go mod download
COPY backup_unas/wireguard/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /unas-wireguard .

FROM python:3.13-slim
WORKDIR /app
COPY --from=wireguard /unas-wireguard /usr/local/bin/unas-wireguard
COPY backup_unas/requirements.lock /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home replica
COPY backup_unas /app/backup_unas
USER replica
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UNAS_ENABLE_TRANSFERS=false
ENTRYPOINT ["python", "-m", "backup_unas.worker"]
