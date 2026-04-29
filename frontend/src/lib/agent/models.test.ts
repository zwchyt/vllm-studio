import { describe, expect, it } from "vitest";
import { normalizeOpenAIModels, modelsToPiModels } from "./models";

describe("agent model normalization", () => {
  it("maps OpenAI /v1/models rows into Pi-ready models", () => {
    const models = normalizeOpenAIModels({
      data: [
        { id: "deepseek-v4-flash", context_window: 1_000_000, max_tokens: 262_144 },
        { id: "tiny", metadata: { context_window: 4096, max_tokens: 512, reasoning: false } },
        { id: "deepseek-v4-flash" },
      ],
    });

    expect(models).toHaveLength(2);
    expect(models.find((m) => m.id === "deepseek-v4-flash")).toMatchObject({
      provider: "vllm-studio",
      contextWindow: 1_000_000,
      maxTokens: 262_144,
      reasoning: true,
    });

    const piModels = modelsToPiModels(models);
    expect(piModels.find((m) => m.id === "tiny")?.compat).toMatchObject({
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    });
  });
});
