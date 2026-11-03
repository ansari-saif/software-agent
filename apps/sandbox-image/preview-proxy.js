// Serves `<project>-<port>.<domain>` by proxying to the dev server on that port inside the sandbox.
// The upstream sees `Host: localhost:<port>`, which dev servers with host allow-lists
// (Vite, webpack-dev-server) always accept. Auth happens before this, in Traefik forwardAuth.
"use strict";
const http = require("http");
const net = require("net");

const LISTEN_PORT = Number(process.env.PREVIEW_PROXY_PORT || 8899);

function targetPort(req) {
  const m = /^[^.]*-([0-9]{2,5})\./.exec(req.headers.host || "");
  const port = m ? Number(m[1]) : NaN;
  return port >= 1 && port <= 65535 && port !== LISTEN_PORT ? port : null;
}

function upstreamHeaders(req, port) {
  return {
    ...req.headers,
    host: `localhost:${port}`,
    "x-forwarded-host": req.headers.host,
    "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
  };
}

function connectUpstream(port, onConnect, onError) {
  const tryHost = (hosts) => {
    const sock = net.connect({ host: hosts[0], port });
    sock.once("connect", () => onConnect(sock, hosts[0]));
    sock.once("error", (err) => {
      if (hosts.length > 1 && err.code === "ECONNREFUSED") tryHost(hosts.slice(1));
      else onError(err);
    });
  };
  tryHost(["127.0.0.1", "::1"]);
}

const server = http.createServer((req, res) => {
  const port = targetPort(req);
  if (!port) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Unknown preview port\n");
    return;
  }
  connectUpstream(
    port,
    (sock, host) => {
      const upstream = http.request(
        {
          createConnection: () => sock,
          host,
          port,
          method: req.method,
          path: req.url,
          headers: upstreamHeaders(req, port),
        },
        (upRes) => {
          res.writeHead(upRes.statusCode || 502, upRes.rawHeaders);
          upRes.pipe(res);
        }
      );
      upstream.on("error", () => res.headersSent ? res.destroy() : res.writeHead(502).end());
      req.pipe(upstream);
    },
    () => {
      res
        .writeHead(502, { "content-type": "text/plain" })
        .end(`Nothing is listening on port ${port} in the sandbox yet.\n`);
    }
  );
});

server.on("upgrade", (req, client, head) => {
  const port = targetPort(req);
  if (!port) return client.destroy();
  connectUpstream(
    port,
    (sock) => {
      const headers = upstreamHeaders(req, port);
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(headers)) {
        for (const value of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${value}`);
      }
      sock.write(lines.join("\r\n") + "\r\n\r\n");
      if (head && head.length) sock.write(head);
      sock.pipe(client).pipe(sock);
      sock.on("error", () => client.destroy());
      client.on("error", () => sock.destroy());
    },
    () => client.destroy()
  );
});

server.listen(LISTEN_PORT, "0.0.0.0");
