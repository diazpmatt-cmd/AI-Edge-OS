import { describe, expect, it } from "vitest";
import { OpenAiQueryProvider } from "../lib/openai-ai-query-provider.js";

describe("OpenAI AI Visibility provider identity", () => {
  it("labels the current lane as a model observation rather than ChatGPT", () => {
    const provider = new OpenAiQueryProvider();
    expect(provider.name).toBe("openai_model_observation");
    expect(provider.name).not.toBe("chatgpt");
    expect(provider.name).not.toBe("openai");
  });
});
