import type { Env } from "./index";

export interface AgentOptions {
    env: Env;
    model?: string;
    history: Array<{ role: string; content: string }>;
}

// Simple function to call Workers AI directly
export async function runAgent(options: AgentOptions, message: string) {
    const { env, model = "@cf/meta/llama-3.1-8b-instruct", history } = options;

    const systemPrompt = `You are a helpful AI assistant. Be concise and helpful. Keep responses under 6 sentences.`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message }
    ];

    try {
        const response = await env.AI.run(model, {
            messages,
            max_tokens: 512,
        });

        const reply = response.response || response.output?.[0]?.content || "Sorry, I couldn't generate a response.";

        return {
            response: reply,
            toolCalls: [],
        };
    } catch (error: any) {
        console.error("AI error:", error);
        throw error;
    }
}