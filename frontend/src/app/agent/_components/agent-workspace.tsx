"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, GitBranch, Loader2, Play, Square, Terminal, Wrench } from "lucide-react";

type AgentModel = {
  id: string;
  name: string;
  provider: "vllm-studio";
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
};

type ToolRecord = {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  text: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  thinking?: string;
  tools?: ToolRecord[];
};

type StreamPayload =
  | { type: "status"; phase: string; [key: string]: unknown }
  | { type: "error"; error: string }
  | { type: "pi"; event: Record<string, unknown> };

const SESSION_ID = "vllm-studio-agent";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractToolText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const result = value as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(result.content)) return "";
  return result.content
    .map((item) => (item && item.type === "text" && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function AgentWorkspace() {
  const [models, setModels] = useState<AgentModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "system",
      text: "T3 Code surface mounted inside vLLM Studio. Provider runtime is Pi coding-agent; models come from the configured backend /v1/models.",
    },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeModel = useMemo(
    () => models.find((model) => model.id === selectedModel),
    [models, selectedModel],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      setLoadingModels(true);
      setError("");
      try {
        const response = await fetch("/api/agent/models", { cache: "no-store" });
        const payload = (await response.json()) as { models?: AgentModel[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load models");
        if (cancelled) return;
        const nextModels = payload.models ?? [];
        setModels(nextModels);
        setSelectedModel((current) => current || nextModels[0]?.id || "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load models");
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }
    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  function patchAssistant(id: string, patch: (message: ChatMessage) => ChatMessage) {
    setMessages((current) =>
      current.map((message) => (message.id === id ? patch(message) : message)),
    );
  }

  function applyPiEvent(assistantId: string, event: Record<string, unknown>) {
    const eventType = event.type;
    if (eventType === "message_update") {
      const assistantMessageEvent = event.assistantMessageEvent as
        | Record<string, unknown>
        | undefined;
      const updateType = assistantMessageEvent?.type;
      if (updateType === "text_delta" && typeof assistantMessageEvent?.delta === "string") {
        const delta = assistantMessageEvent.delta;
        patchAssistant(assistantId, (message) => ({ ...message, text: message.text + delta }));
      }
      if (updateType === "thinking_delta" && typeof assistantMessageEvent?.delta === "string") {
        const delta = assistantMessageEvent.delta;
        patchAssistant(assistantId, (message) => ({
          ...message,
          thinking: (message.thinking || "") + delta,
        }));
      }
      if (updateType === "toolcall_end") {
        const toolCall = assistantMessageEvent?.toolCall as
          | { id?: string; name?: string; arguments?: unknown }
          | undefined;
        if (toolCall?.id) {
          patchAssistant(assistantId, (message) => ({
            ...message,
            tools: [
              ...(message.tools || []),
              {
                id: toolCall.id || newId("tool"),
                name: toolCall.name || "tool",
                status: "running",
                text: JSON.stringify(toolCall.arguments ?? {}, null, 2),
              },
            ],
          }));
        }
      }
    }

    if (eventType === "tool_execution_start") {
      const toolCallId = String(event.toolCallId || newId("tool"));
      const toolName = String(event.toolName || "tool");
      patchAssistant(assistantId, (message) => {
        const existing = message.tools || [];
        if (existing.some((tool) => tool.id === toolCallId)) return message;
        return {
          ...message,
          tools: [...existing, { id: toolCallId, name: toolName, status: "running", text: "" }],
        };
      });
    }

    if (eventType === "tool_execution_update" || eventType === "tool_execution_end") {
      const toolCallId = String(event.toolCallId || "");
      const resultText = extractToolText(event.partialResult || event.result);
      patchAssistant(assistantId, (message) => ({
        ...message,
        tools: (message.tools || []).map((tool) =>
          tool.id === toolCallId
            ? {
                ...tool,
                status:
                  eventType === "tool_execution_end"
                    ? ((event.isError ? "error" : "done") as ToolRecord["status"])
                    : tool.status,
                text: resultText || tool.text,
              }
            : tool,
        ),
      }));
    }

    if (eventType === "message_end") {
      const ended = event.message as
        | {
            role?: string;
            content?: Array<{ type?: string; text?: string; thinking?: string }>;
            errorMessage?: string;
          }
        | undefined;
      if (ended?.role === "assistant") {
        const finalText = Array.isArray(ended.content)
          ? ended.content
              .map((item) =>
                item.type === "text" && typeof item.text === "string" ? item.text : "",
              )
              .filter(Boolean)
              .join("\n")
          : "";
        const finalThinking = Array.isArray(ended.content)
          ? ended.content
              .map((item) =>
                item.type === "thinking" && typeof item.thinking === "string" ? item.thinking : "",
              )
              .filter(Boolean)
              .join("\n")
          : "";
        patchAssistant(assistantId, (message) => ({
          ...message,
          text: message.text || finalText || ended.errorMessage || message.text,
          thinking: message.thinking || finalThinking || message.thinking,
        }));
      }
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !selectedModel || status === "running" || status === "starting") return;

    const userId = newId("user");
    const assistantId = newId("assistant");
    setInput("");
    setError("");
    setStatus("starting");
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text },
      { id: assistantId, role: "assistant", text: "", tools: [] },
    ]);

    try {
      const response = await fetch("/api/agent/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION_ID, modelId: selectedModel, message: text }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Agent request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as StreamPayload;
          if (payload.type === "status")
            setStatus(payload.phase === "done" ? "idle" : payload.phase);
          if (payload.type === "error") {
            setError(payload.error);
            setStatus("idle");
          }
          if (payload.type === "pi") applyPiEvent(assistantId, payload.event);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent request failed");
    } finally {
      setStatus("idle");
    }
  }

  async function abortTurn() {
    await fetch("/api/agent/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID }),
    }).catch(() => undefined);
    setStatus("idle");
  }

  return (
    <div className="flex h-[100dvh] min-h-0 bg-(--bg) text-(--fg)">
      <aside className="hidden w-64 shrink-0 border-r border-(--border) bg-(--surface) md:flex md:flex-col">
        <div className="border-b border-(--border) p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4" />
            T3 Code / Pi
          </div>
          <p className="mt-1 text-xs leading-5 text-(--dim)">
            Existing vLLM Studio stays intact. This is the plopped-in agent surface.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-(--dim)">
            Threads
          </div>
          <button className="w-full border border-(--border) bg-(--bg) px-3 py-2 text-left text-sm">
            <div className="font-medium">vLLM Studio workspace</div>
            <div className="mt-1 text-xs text-(--dim)">Pi session: {SESSION_ID}</div>
          </button>
        </div>
        <div className="border-t border-(--border) p-3 text-xs text-(--dim)">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5" /> Repo cwd
          </div>
          <code className="mt-1 block truncate">server-configured workspace</code>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-(--border) bg-(--bg) px-4">
          <div>
            <h1 className="text-sm font-semibold">Agent</h1>
            <p className="text-xs text-(--dim)">
              Pi coding-agent over OpenAI-compatible /v1/models
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 max-w-[360px] border border-(--border) bg-(--surface) px-2 text-sm outline-none"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={loadingModels || status === "running" || status === "starting"}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void abortTurn()}
              disabled={status !== "running" && status !== "starting"}
              className="inline-flex h-9 items-center gap-2 border border-(--border) px-3 text-sm disabled:opacity-40"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          </div>
        </header>

        {error ? (
          <div className="border-b border-(--err) bg-(--err)/10 px-4 py-2 text-sm text-(--err)">
            {error}
          </div>
        ) : null}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-5xl space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {status !== "idle" ? (
              <div className="flex items-center gap-2 text-xs text-(--dim)">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status}
              </div>
            ) : null}
          </div>
        </div>

        <form
          onSubmit={sendMessage}
          className="shrink-0 border-t border-(--border) bg-(--surface) p-4"
        >
          <div className="mx-auto flex max-w-5xl gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                activeModel
                  ? `Ask ${activeModel.name} to edit, inspect, or run commands…`
                  : "Load a /v1/models entry first…"
              }
              className="min-h-20 flex-1 resize-none border border-(--border) bg-(--bg) p-3 text-sm outline-none focus:border-(--fg)"
            />
            <button
              type="submit"
              disabled={
                !input.trim() || !selectedModel || status === "running" || status === "starting"
              }
              className="inline-flex h-20 w-24 items-center justify-center gap-2 border border-(--border) bg-(--fg) text-sm font-medium text-(--bg) disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> Send
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  return (
    <article className={`border border-(--border) ${isUser ? "bg-(--surface)" : "bg-(--bg)"}`}>
      <div className="flex items-center gap-2 border-b border-(--border) px-3 py-2 text-xs font-semibold uppercase tracking-wide text-(--dim)">
        {isUser ? "You" : isSystem ? "System" : "Pi"}
      </div>
      <div className="whitespace-pre-wrap px-3 py-3 text-sm leading-6">
        {message.text || (!isUser && !isSystem ? "…" : "")}
      </div>
      {message.thinking ? (
        <details className="border-t border-(--border) px-3 py-2 text-xs text-(--dim)">
          <summary>Thinking</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5">
            {message.thinking}
          </pre>
        </details>
      ) : null}
      {message.tools?.length ? (
        <div className="border-t border-(--border) p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--dim)">
            <Wrench className="h-3.5 w-3.5" /> Tools
          </div>
          <div className="space-y-2">
            {message.tools.map((tool) => (
              <details
                key={tool.id}
                className="border border-(--border) bg-(--surface)"
                open={tool.status === "running"}
              >
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                  <Terminal className="h-3.5 w-3.5" /> {tool.name}{" "}
                  <span className="text-(--dim)">{tool.status}</span>
                </summary>
                {tool.text ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap border-t border-(--border) p-3 font-mono text-[11px] leading-5">
                    {tool.text}
                  </pre>
                ) : null}
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
