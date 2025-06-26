FROM lscr.io/linuxserver/code-server:latest

USER root

RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/stich-worker /tmp/.npm-cache \
    && chown -R abc:abc /tmp/stich-worker /tmp/.npm-cache \
    && npm config --global set cache /tmp/.npm-cache

USER abc
WORKDIR /tmp/stich-worker

# FIXME: I've to update this 
RUN git clone my-code-repo . \
    && npm ci

EXPOSE 8443
