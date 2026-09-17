#!/usr/bin/env node
import http from "node:http";

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
  delete process.env[key];
}

const url = process.env.TEAM_CONTEXT_COMPACT_URL || "http://127.0.0.1:18765/api/compact.txt";

function getText(target) {
  return new Promise((resolve, reject) => {
    const req = http.get(target, { timeout: 1200 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body.trim()));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

try {
  const text = await getText(url);
  if (!text) process.exit(0);
  process.stdout.write(JSON.stringify({ additionalContext: text }));
} catch {
  process.exit(0);
}
