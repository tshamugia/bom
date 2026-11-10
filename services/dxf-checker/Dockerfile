FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Runs as an unprivileged user; uploaded DXFs live only in /tmp/dxf for the length of a run.
RUN useradd --system --uid 1001 --create-home --home-dir /home/checker checker \
 && mkdir -p /tmp/dxf && chown checker /tmp/dxf
USER checker

ENV PORT=8080 \
    WORK_DIR=/tmp/dxf
EXPOSE 8080

# One dual-stack socket: Railway's private network may use IPv6 or IPv4 (app/serve.py).
CMD ["python", "-m", "app.serve"]
