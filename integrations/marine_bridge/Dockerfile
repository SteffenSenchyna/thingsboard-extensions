# Marine bridge: AIS position reports (aisstream.io) -> ThingsBoard MQTT gateway.
# Secrets are resolved at start-up from 1Password; only OP_SERVICE_ACCOUNT_TOKEN
# is passed to the container (see README.md).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY marine_bridge.py .

# Run unprivileged; the script needs no files or ports of its own.
RUN useradd --system --no-create-home --uid 1000 bridge
USER bridge

CMD ["python", "marine_bridge.py"]
