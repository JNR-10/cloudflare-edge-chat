import { Agent } from "@cloudflare/agents";
import type { Env } from "./index";

// Safe domain allowlist for searchSite tool
const ALLOWED_DOMAINS = [
  "example.com",
  "cloudflare.com",
  "workers.dev",
  "wikipedia.org",
];

interface SessionMemory {
  saveMemory(key: string, value: string): Promise<void>;
  recallMemory(key: string): Promise<string | null>;
}

export interface AgentOptions {
  env: Env;
  sessionMemory: SessionMemory;
  model?: string;
}

export function createAgent(options: AgentOptions) {
  const { env, sessionMemory, model = "@cf/meta/llama-3.3-8b-instruct" } = options;

  const agent = new Agent({
    // @ts-ignore
    ai: env.AI,
    model,
    systemPrompt: `You are a helpful AI assistant with access to tools.
You can search websites, provide FAQ information, and remember user preferences.
Use tools when appropriate. Be concise and helpful.`,
    tools: [
      {
        name: "searchSite",
        description: "Fetches and extracts text content from a URL. Only allowed domains: example.com, cloudflare.com, workers.dev, wikipedia.org",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to fetch" },
          },
          required: ["url"],
        },
        async handler({ url }: { url: string }) {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace(/^www\./, "");
            const isAllowed = ALLOWED_DOMAINS.some(allowed => 
              domain === allowed || domain.endsWith("." + allowed)
            );
            if (!isAllowed) {
              return { success: false, error: `Domain ${domain} not allowed` };
            }
            const response = await fetch(url, {
              headers: { "User-Agent": "CloudflareWorker/1.0" },
            });
            if (!response.ok) {
              return { success: false, error: `HTTP ${response.status}` };
            }
            const html = await response.text();
            const text = html
              .replace(/<script[^>]*>.*?<\/script>/gis, "")
              .replace(/<style[^>]*>.*?<\/style>/gis, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 2000);
            return { success: true, url, text, length: text.length };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      },
      {
        name: "getFAQ",
        description: "Returns frequently asked questions about the service",
        parameters: { type: "object", properties: {}, required: [] },
        async handler() {
          return {
            faqs: [
              { q: "What is this?", a: "AI helpdesk on Cloudflare Workers with Agents SDK" },
              { q: "How does memory work?", a: "Stored per session using Durable Objects" },
              { q: "What tools?", a: "searchSite, getFAQ, saveMemory, recallMemory" },
            ],
          };
        },
      },
      {
        name: "saveMemory",
        description: "Saves a key-value pair to session memory",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string" },
            value: { type: "string" },
          },
          required: ["key", "value"],
        },
        async handler({ key, value }: { key: string; value: string }) {
          await sessionMemory.saveMemory(key, value);
          return { success: true, message: `Saved ${key}` };
        },
      },
      {
        name: "recallMemory",
        description: "Retrieves a value from session memory by key",
        parameters: {
          type: "object",
          properties: { key: { type: "string" } },
          required: ["key"],
        },
        async handler({ key }: { key: string }) {
          const value = await sessionMemory.recallMemory(key);
          if (value === null) {
            return { success: false, message: `No memory for key: ${key}` };
          }
          return { success: true, key, value };
        },
      },
    ],
  });

  return agent;
}