import { EventEmitter } from "node:events";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type TerminalChunk =
  | { type: "out"; text: string }
  | { type: "err"; text: string }
  | { type: "exit"; code: number | null; signal: NodeJS.Signals | null }
  | { type: "error"; text: string };

function defaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  if (process.platform === "darwin") return "/bin/zsh";
  return "/bin/bash";
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(homedir(), value.slice(2));
  return value;
}

function resolveCwd(input?: string): string {
  const raw = input?.trim();
  if (!raw) return process.cwd();
  const expanded = expandHome(raw);
  const candidate = path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);
  try {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  } catch {
    /* fall through */
  }
  return process.cwd();
}

export class TerminalSession extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private cwd: string;
  private shell: string;
  public lastUsed = Date.now();

  constructor(cwd: string) {
    super();
    this.cwd = resolveCwd(cwd);
    this.shell = defaultShell();
    this.setMaxListeners(64);
  }

  start(): void {
    if (this.child && !this.child.killed) return;
    try {
      const child = spawn(this.shell, ["-i"], {
        cwd: this.cwd,
        env: {
          ...process.env,
          TERM: process.env.TERM || "dumb",
          PS1: "$ ",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (text: string) => {
        this.emit("chunk", { type: "out", text } satisfies TerminalChunk);
      });
      child.stderr.on("data", (text: string) => {
        this.emit("chunk", { type: "err", text } satisfies TerminalChunk);
      });
      child.on("exit", (code, signal) => {
        this.emit("chunk", { type: "exit", code, signal } satisfies TerminalChunk);
        if (this.child === child) this.child = null;
      });
      child.on("error", (error) => {
        this.emit("chunk", {
          type: "error",
          text: error instanceof Error ? error.message : "shell error",
        } satisfies TerminalChunk);
      });
    } catch (error) {
      this.emit("chunk", {
        type: "error",
        text: error instanceof Error ? error.message : "Failed to spawn shell",
      } satisfies TerminalChunk);
    }
  }

  write(input: string): void {
    if (!this.child || this.child.killed) return;
    const payload = input.endsWith("\n") ? input : `${input}\n`;
    this.child.stdin.write(payload);
    this.lastUsed = Date.now();
  }

  isRunning(): boolean {
    return Boolean(this.child && !this.child.killed);
  }

  stop(): void {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 500);
  }
}

class TerminalRuntimeManager {
  private sessions = new Map<string, TerminalSession>();

  getOrCreate(sessionId: string, cwd: string): TerminalSession {
    const existing = this.sessions.get(sessionId);
    if (existing && existing.isRunning()) {
      existing.lastUsed = Date.now();
      return existing;
    }
    const created = new TerminalSession(cwd);
    created.start();
    this.sessions.set(sessionId, created);
    return created;
  }

  get(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.stop();
    this.sessions.delete(sessionId);
    return true;
  }
}

const globalForTerminal = globalThis as typeof globalThis & {
  __vllmStudioTerminalRuntime?: TerminalRuntimeManager;
};

export const terminalRuntimeManager =
  globalForTerminal.__vllmStudioTerminalRuntime ?? new TerminalRuntimeManager();
globalForTerminal.__vllmStudioTerminalRuntime = terminalRuntimeManager;
