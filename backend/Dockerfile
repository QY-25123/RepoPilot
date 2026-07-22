FROM python:3.12-slim

WORKDIR /app

# --- system tools for downloading the MCP binary ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# --- download github-mcp-server binary ---
RUN set -e && \
    ARCH=$(uname -m) && \
    case "$ARCH" in \
      x86_64)  GOARCH="x86_64" ;; \
      aarch64) GOARCH="arm64"  ;; \
      *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac && \
    LATEST=$(curl -fsSL https://api.github.com/repos/github/github-mcp-server/releases/latest \
             | jq -r '.tag_name') && \
    echo "Downloading github-mcp-server ${LATEST} for Linux/${GOARCH}" && \
    curl -fsSL \
      "https://github.com/github/github-mcp-server/releases/download/${LATEST}/github-mcp-server_Linux_${GOARCH}.tar.gz" \
      -o /tmp/mcp.tar.gz && \
    tar -xzf /tmp/mcp.tar.gz -C /tmp && \
    find /tmp -maxdepth 3 -name 'github-mcp-server' -type f | head -1 | xargs -I{} mv {} /usr/local/bin/github-mcp-server && \
    chmod +x /usr/local/bin/github-mcp-server && \
    rm -f /tmp/mcp.tar.gz

# --- python dependencies ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- application code ---
COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
