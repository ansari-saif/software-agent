FROM  ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
# Use Yandex mirror instead of the broken ports.ubuntu.com
RUN set -eux; \
    sed -i 's|http://ports.ubuntu.com|http://mirror.yandex.ru/ubuntu-ports|g' /etc/apt/sources.list; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*; \
    apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout="30"; \
    apt-get install -y --no-install-recommends \
        curl wget git python3 python3-pip ca-certificates \
        || (echo "APT failed, showing logs..." && cat /var/log/apt/term.log && exit 1); \
    rm -rf /var/lib/apt/lists/*



# Install Docker Engine, CLI, and Compose plugin (official way)
# RUN curl -fsSL https://get.docker.com | bash
# as you can do this 
# volumes:
#     - /var/run/docker.sock:/var/run/docker.sock


# Install Node.js LTS
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs

# Install pnpm globally
RUN npm install -g pnpm



# Set working directory
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/worker/package.json ./apps/worker/

# Install all dependencies
RUN pnpm install

# Install Docker CLI + Compose plugin (for talking to host Docker via mounted socket)
RUN set -eux; \
    apt-get update -o Acquire::Retries=3; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        lsb-release; \
    mkdir -p /etc/apt/keyrings; \
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg; \
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list; \
    apt-get update -o Acquire::Retries=3; \
    apt-get install -y --no-install-recommends \
        docker-ce-cli \
        docker-compose-plugin; \
    rm -rf /var/lib/apt/lists/*

# Copy rest of the code
COPY . .
    
# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 8080 9091 5432 5555

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]

