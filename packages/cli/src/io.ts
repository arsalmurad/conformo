import { readFile } from "node:fs/promises";
import { UsageError } from "./args.js";

/** Everything a command touches outside its own arguments, so tests can run it in-process. */
export interface Io {
  /** Write text to stdout exactly as given (no newline is added). */
  out(text: string): void;
  /** Write text to stderr exactly as given. */
  err(text: string): void;
  readStdin(): Promise<Buffer>;
}

export const line = (text: string): string => (text.endsWith("\n") ? text : `${text}\n`);

export const processIo: Io = {
  out: (t) => { process.stdout.write(t); },
  err: (t) => { process.stderr.write(t); },
  async readStdin() {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  },
};

/** Reads a file, or stdin for "-". An unreadable file is a usage/input error (exit 2). */
export async function readInput(file: string, io: Io): Promise<Buffer> {
  if (file === "-") return io.readStdin();
  try {
    return await readFile(file);
  } catch (err) {
    throw new UsageError(`Could not read ${file}: ${(err as Error).message}`);
  }
}
