FROM lscr.io/linuxserver/code-server:latest

USER root
RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/code100x/base-react-native-expo.git /tmp/bolty-worker \
    && cd /tmp/bolty-worker && npm install


EXPOSE 8443