import { NextRequest, NextResponse } from "next/server";
import { terminalRuntimeManager } from "@/lib/agent/terminal-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : "default";
  const closed = terminalRuntimeManager.close(sessionId);
  return NextResponse.json({ ok: true, closed });
}
