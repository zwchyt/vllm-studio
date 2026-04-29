import { NextRequest } from "next/server";
import {
  terminalRuntimeManager,
  type TerminalChunk,
  type TerminalSession,
} from "@/lib/agent/terminal-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TerminalRequest = {
  sessionId?: string;
  cwd?: string;
  input?: string;
};

function sse(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export async function POST(request: NextRequest) {
  let body: TerminalRequest;
  try {
    body = (await request.json()) as TerminalRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : "default";
  const cwd = typeof body.cwd === "string" && body.cwd.trim() ? body.cwd.trim() : undefined;
  const input = typeof body.input === "string" ? body.input : "";

  let session: TerminalSession;
  try {
    session = terminalRuntimeManager.getOrCreate(sessionId, cwd ?? process.cwd());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to start terminal session" },
      { status: 500 },
    );
  }

  if (input) {
    session.write(input);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeSse = (payload: unknown) => {
        if (closed) return;
        try {
          sse(controller, payload);
        } catch {
          closed = true;
        }
      };

      const onChunk = (chunk: TerminalChunk) => {
        safeSse(chunk);
      };
      session.on("chunk", onChunk);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15000);

      safeSse({ type: "ready", sessionId });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        session.off("chunk", onChunk);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
