FROM lscr.io/linuxserver/code-server:latest

USER root

RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Clone into a safe location NOT overwritten by bind mount
RUN mkdir -p /template /tmp/.npm-cache \
    && git clone https://github.com/ansari-saif/backend-agent-code-template.git /template \
    && chown -R abc:abc /template /tmp/.npm-cache \
    && npm config --global set cache /tmp/.npm-cache

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER abc
ENTRYPOINT ["/entrypoint.sh"]
