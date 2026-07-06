import http from "node:http";
import { runDiscovery, runDownload, getStatus, cancelBackup } from "./automation.js";

const PORT = 8722;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("JSON invalido"));
      }
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    sendJson(res, 200, getStatus());
    return;
  }

  if (req.method === "POST" && req.url === "/discover") {
    readBody(req)
      .then(({ fileKey }) => {
        if (!fileKey) {
          sendJson(res, 400, { error: "fileKey e obrigatorio" });
          return;
        }
        runDiscovery({ fileKey }).catch((error) => console.error("Descoberta falhou:", error));
        sendJson(res, 202, { started: true });
      })
      .catch(() => sendJson(res, 400, { error: "JSON invalido" }));
    return;
  }

  if (req.method === "POST" && req.url === "/download") {
    readBody(req)
      .then(({ hrefs, outputDir }) => {
        if (!Array.isArray(hrefs) || hrefs.length === 0) {
          sendJson(res, 400, { error: "hrefs e obrigatorio" });
          return;
        }
        runDownload({ hrefs, outputDir }).catch((error) => console.error("Download falhou:", error));
        sendJson(res, 202, { started: true });
      })
      .catch(() => sendJson(res, 400, { error: "JSON invalido" }));
    return;
  }

  if (req.method === "POST" && req.url === "/cancel") {
    cancelBackup();
    sendJson(res, 200, { cancelled: true });
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Figma Backup Helper rodando em http://localhost:${PORT}`);
});
