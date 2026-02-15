// src/ai/provider.ts
import { readFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
function readKeyFile(projectRoot, filename) {
  try {
    const key = readFileSync(join(projectRoot, filename), "utf-8").trim();
    return key || null;
  } catch {
    return null;
  }
}
function getAIProvider(options) {
  const anthropicEnv = process.env.ANTHROPIC_API_KEY;
  if (anthropicEnv) {
    return { provider: "anthropic", apiKey: anthropicEnv, model: "claude-sonnet-4-5-20250929" };
  }
  const openaiEnv = process.env.OPENAI_API_KEY;
  if (openaiEnv) {
    return { provider: "openai", apiKey: openaiEnv, model: "gpt-4o" };
  }
  const anthropicKey = readKeyFile(options.projectRoot, ".anthropic");
  if (anthropicKey) {
    return { provider: "anthropic", apiKey: anthropicKey, model: "claude-sonnet-4-5-20250929" };
  }
  const openaiKey = readKeyFile(options.projectRoot, ".openai");
  if (openaiKey) {
    return { provider: "openai", apiKey: openaiKey, model: "gpt-4o" };
  }
  return null;
}
async function callAI(options) {
  if (options.ai.provider === "anthropic") {
    return callAnthropic(options);
  }
  return callOpenAI(options);
}
async function callAnthropic(options) {
  const client = new Anthropic({ apiKey: options.ai.apiKey });
  const content = options.userContent.map((block) => {
    if (block.type === "image_url" && block.image_url) {
      const url = block.image_url.url;
      const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        return {
          type: "image",
          source: { type: "base64", media_type: match[1], data: match[2] }
        };
      }
    }
    return { type: "text", text: block.text || "" };
  });
  let system = options.system;
  if (options.jsonMode) {
    system += "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.";
  }
  const response = await client.messages.create({
    model: options.ai.model,
    max_tokens: options.maxTokens || 500,
    system,
    messages: [{ role: "user", content }]
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : null;
}
async function callOpenAI(options) {
  const client = new OpenAI({ apiKey: options.ai.apiKey });
  const messages = [
    { role: "system", content: options.system },
    { role: "user", content: options.userContent.map((block) => {
      if (block.type === "image_url" && block.image_url) {
        return { type: "image_url", image_url: { url: block.image_url.url } };
      }
      return { type: "text", text: block.text || "" };
    }) }
  ];
  const response = await client.chat.completions.create({
    model: options.ai.model,
    max_tokens: options.maxTokens || 500,
    messages,
    ...options.jsonMode ? { response_format: { type: "json_object" } } : {}
  });
  return response.choices[0]?.message?.content || null;
}
var NO_AI_KEY_MESSAGE = "No AI API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or create .anthropic/.openai file in project root.";
export {
  NO_AI_KEY_MESSAGE,
  callAI,
  getAIProvider
};
//# sourceMappingURL=provider.js.map