FROM lscr.io/linuxserver/code-server:latest

USER root

RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/bolty-worker /tmp/.npm-cache \
    && chown -R abc:abc /tmp/bolty-worker /tmp/.npm-cache \
    && npm config --global set cache /tmp/.npm-cache

USER abc
WORKDIR /tmp/bolty-worker

RUN git clone https://github.com/code100x/base-react-native-expo.git . \
    && npm ci

EXPOSE 8443
