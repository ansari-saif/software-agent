# Pinned base image version (no floating :latest tag)
FROM lscr.io/linuxserver/code-server:4.96.4

USER root

ARG NODE_VERSION=20.18.3
# No default: BuildKit sets TARGETARCH from the target platform (amd64 on the
# server, arm64 on Apple Silicon). A hardcoded default breaks arm64 builds.
ARG TARGETARCH

RUN apt-get update --fix-missing && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        xz-utils \
        git \
        ripgrep \
        python3 \
        python3-pip \
        python3-venv \
        build-essential && \
    ARCH_SUFFIX=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "x64") && \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH_SUFFIX}.tar.xz" && \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" && \
    grep " node-v${NODE_VERSION}-linux-${ARCH_SUFFIX}.tar.xz\$" SHASUMS256.txt | sha256sum -c - && \
    tar -xJf "node-v${NODE_VERSION}-linux-${ARCH_SUFFIX}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner && \
    rm -f "node-v${NODE_VERSION}-linux-${ARCH_SUFFIX}.tar.xz" SHASUMS256.txt && \
    npm install -g pnpm@9.0.0 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create isolated Python virtual environment + uv
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV" && \
    "$VIRTUAL_ENV/bin/pip" install --no-cache-dir --upgrade pip uv && \
    chown -R abc:abc "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:/usr/local/bin:$PATH"

# Prepare empty workspace & code-server config with strict permissions (never 777)
RUN mkdir -p /workspace /config/data/User /config/.config /config/.local /config/extensions /tmp/processes && \
    chown -R abc:abc /workspace /config /tmp/processes && \
    chmod -R 750 /workspace /config /tmp/processes

COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

# Preview proxy for `<port>.<project>.<domain>`, supervised by s6 next to code-server.
COPY preview-proxy.js /usr/local/lib/preview-proxy.js
RUN SVC=/etc/s6-overlay/s6-rc.d/svc-preview-proxy && \
    mkdir -p "$SVC/dependencies.d" && \
    touch "$SVC/dependencies.d/init-services" /etc/s6-overlay/s6-rc.d/user/contents.d/svc-preview-proxy && \
    echo longrun > "$SVC/type" && \
    printf '#!/usr/bin/with-contenv bash\nexec s6-setuidgid abc /usr/local/bin/node /usr/local/lib/preview-proxy.js\n' > "$SVC/run" && \
    chmod 755 "$SVC/run" && chmod 644 /usr/local/lib/preview-proxy.js

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
