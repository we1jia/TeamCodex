#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const attach = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "attach_codex.mjs");
const child = spawn(process.execPath, [attach], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
