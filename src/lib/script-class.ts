import { opcodes, script } from "bitcoinjs-lib";

export class Script {
  bytes: number[];

  static new() {
    return new Script();
  }

  constructor() {
    this.bytes = [];
  }

  pushByte(n: number) {
    if (n < 0 || n > 255) throw new Error("tried to push a non-byte number");

    this.bytes.push(n);
    return this;
  }

  pushBytes(data: Uint8Array) {
    const n = data.length;
    if (n < opcodes.OP_PUSHDATA1) {
      this.pushByte(n);
    } else if (n < 0x100) {
      this.pushByte(opcodes.OP_PUSHDATA1);
      this.pushByte(n);
    } else if (n < 0x10000) {
      this.pushByte(opcodes.OP_PUSHDATA2);
      this.pushByte(n % 0x100);
      this.pushByte(Math.floor(n / 0x100));
    } else if (n < 0x100000000) {
      this.pushByte(opcodes.OP_PUSHDATA4);
      this.pushByte(n % 0x100);
      this.pushByte(Math.floor(n / 0x100) % 0x100);
      this.pushByte(Math.floor(n / 0x10000) % 0x100);
      this.pushByte(Math.floor(n / 0x1000000));
    } else {
      throw new Error("tried to put a 4bn+ sized object into a script!");
    }

    this.bytes = this.bytes.concat(Array.from(data));

    return this;
  }

  pushChunks(chunks: Uint8Array[]) {
    chunks.forEach((chunk) => this.pushBytes(chunk));
    return this;
  }

  pushString(s: string, maxLen?: number) {
    const ec = new TextEncoder();
    const bytes = ec.encode(s);
    if (maxLen && bytes.length > maxLen) {
      const chunks = [];
      for (let i = 0; i < bytes.length; i += maxLen) {
        chunks.push(bytes.subarray(i, i + maxLen));
      }
      return this.pushChunks(chunks);
    }
    return this.pushBytes(ec.encode(s));
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }

  toHex() {
    return this.toBuffer().toString("hex");
  }

  toAsm() {
    return script.toASM(this.toBuffer());
  }
}
