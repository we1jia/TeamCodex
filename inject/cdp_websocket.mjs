import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

export class CdpWebSocket {
  constructor(rawUrl) {
    this.url = new URL(rawUrl);
    this.readyState = CONNECTING;
    this.listeners = new Map();
    this.buffer = Buffer.alloc(0);
    this.handshakeDone = false;
    this.fragments = [];
    this.fragmentOpcode = 0;

    const secure = this.url.protocol === "wss:";
    const port = Number(this.url.port || (secure ? 443 : 80));
    const options = { host: this.url.hostname, port };
    this.socket = secure ? tls.connect(options) : net.connect(options);
    this.socket.on("data", (chunk) => this.handleData(chunk));
    this.socket.on("error", (error) => {
      this.emit("error", { error, message: error.message });
    });
    this.socket.on("close", () => {
      this.readyState = CLOSED;
      this.emit("close", {});
    });
    this.socket.once(secure ? "secureConnect" : "connect", () => {
      const key = crypto.randomBytes(16).toString("base64");
      const host = this.url.host;
      const target = `${this.url.pathname || "/"}${this.url.search || ""}`;
      const request = [
        `GET ${target} HTTP/1.1`,
        `Host: ${host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n");
      this.socket.write(request);
    });
  }

  addEventListener(type, listener, options = {}) {
    if (typeof listener !== "function") return;
    const items = this.listeners.get(type) || [];
    items.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, items);
  }

  removeEventListener(type, listener) {
    const items = this.listeners.get(type) || [];
    this.listeners.set(type, items.filter((item) => item.listener !== listener));
  }

  emit(type, event) {
    const items = this.listeners.get(type) || [];
    for (const item of [...items]) {
      try {
        item.listener(event);
      } catch {}
      if (item.once) {
        const current = this.listeners.get(type) || [];
        this.listeners.set(type, current.filter((candidate) => candidate !== item));
      }
    }
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshakeDone) {
      const marker = this.buffer.indexOf("\r\n\r\n");
      if (marker < 0) return;
      const header = this.buffer.subarray(0, marker).toString("ascii");
      if (!/^HTTP\/1\.[01] 101\b/.test(header)) {
        this.emit("error", { message: `CDP websocket handshake failed: ${header.split("\r\n")[0] || "unknown"}` });
        this.socket.destroy();
        return;
      }
      this.buffer = this.buffer.subarray(marker + 4);
      this.handshakeDone = true;
      this.readyState = OPEN;
      this.emit("open", {});
    }
    this.readFrames();
  }

  readFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const high = this.buffer.readUInt32BE(2);
        const low = this.buffer.readUInt32BE(6);
        length = high * 2 ** 32 + low;
        offset = 10;
      }
      if (length > 64 * 1024 * 1024) {
        this.emit("error", { message: "CDP websocket frame is too large" });
        this.socket.destroy();
        return;
      }
      const maskLength = masked ? 4 : 0;
      const frameLength = offset + maskLength + length;
      if (this.buffer.length < frameLength) return;

      let payloadOffset = offset;
      let mask = null;
      if (masked) {
        mask = this.buffer.subarray(offset, offset + 4);
        payloadOffset += 4;
      }
      let payload = this.buffer.subarray(payloadOffset, payloadOffset + length);
      if (mask) {
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      }
      this.buffer = this.buffer.subarray(frameLength);

      if (opcode === 0x8) {
        this.readyState = CLOSING;
        this.socket.end();
        return;
      }
      if (opcode === 0x9) {
        this.writeFrame(0xA, payload);
        continue;
      }
      if (opcode === 0xA) continue;

      if (opcode === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          this.emit("message", { data: Buffer.concat(this.fragments).toString() });
          this.fragments = [];
          this.fragmentOpcode = 0;
        }
        continue;
      }
      if (!fin) {
        this.fragmentOpcode = opcode;
        this.fragments = [payload];
        continue;
      }
      this.emit("message", { data: payload.toString() });
    }
  }

  writeFrame(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return;
    const body = Buffer.from(payload || "");
    const mask = crypto.randomBytes(4);
    let header;
    if (body.length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | body.length;
    } else if (body.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(body.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeUInt32BE(Math.floor(body.length / 2 ** 32), 2);
      header.writeUInt32BE(body.length >>> 0, 6);
    }
    header[0] = 0x80 | opcode;
    const maskedBody = Buffer.from(body);
    for (let i = 0; i < maskedBody.length; i += 1) maskedBody[i] ^= mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, maskedBody]));
  }

  send(data) {
    if (this.readyState !== OPEN) throw new Error("cdp websocket is not open");
    this.writeFrame(0x1, Buffer.from(String(data)));
  }

  close() {
    if (this.readyState === CLOSED || this.readyState === CLOSING) return;
    this.readyState = CLOSING;
    this.writeFrame(0x8, Buffer.alloc(0));
    this.socket.end();
  }
}
