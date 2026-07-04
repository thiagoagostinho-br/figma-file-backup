import http from "node:http";
import { runBackup, getStatus, cancelBackup } from "./automation.js";

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

  if (req.method === "POST" && req.url === "/start") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const { teamIds, outputDir } = JSON.parse(body || "{}");
        if (!Array.isArray(teamIds) || teamIds.length === 0) {
          sendJson(res, 400, { error: "teamIds e obrigatorio" });
          return;
        }
        runBackup({ teamIds, outputDir }).catch((error) => {
          console.error("Backup falhou:", error);
        });
        sendJson(res, 202, { started: true });
      } catch {
        sendJson(res, 400, { error: "JSON invalido" });
      }
    });
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
