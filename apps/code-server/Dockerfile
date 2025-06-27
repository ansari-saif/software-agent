FROM lscr.io/linuxserver/code-server:latest

USER root

# Add retry logic and error handling for package installation
RUN apt-get update --fix-missing && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Clone into a safe location NOT overwritten by bind mount
RUN mkdir -p /template \
    && git clone https://github.com/ansari-saif/backend-agent-code-template.git /template \
    && chown -R abc:abc /template

# Install Python dependencies
WORKDIR /template


COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Ensure abc user has access to the virtual environment
RUN chown -R abc:abc $VIRTUAL_ENV

USER root
RUN touch /config/.bashrc && chown abc:abc /config/.bashrc

USER abc
RUN echo "source $VIRTUAL_ENV/bin/activate" >> /config/.bashrc

RUN pip install -r requirements.txt

ENTRYPOINT ["/entrypoint.sh"]