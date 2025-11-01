import { nanoid } from "./utils";
import { runAgent } from "./agent";

export interface Env {
    AI: any;
    SESSIONS: DurableObjectNamespace;
    MODEL?: string;
}

interface ChatRequest {
    message: string;
    model?: string;
}

// Type for Durable Object SQL storage
interface SqlStorageResult {
    [key: string]: any;
}

function getCookie(request: Request, name: string): string | null {
    const cookie = request.headers.get("Cookie") || "";
    const parts = cookie.split(/;\s*/);
    for (const p of parts) {
        const [k, ...rest] = p.split("=");
        if (k === name) return decodeURIComponent(rest.join("="));
    }
    return null;
}

function setCookie(name: string, value: string, days = 7) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        let sid = getCookie(request, "sid");
        if (!sid) sid = nanoid();

        if (url.pathname === "/api/healthz") {
            return new Response("ok", { headers: { ...CORS_HEADERS, "Content-Type": "text/plain" } });
        }

        if (url.pathname === "/api/agent/chat" && request.method === "POST") {
            try {
                const { message, model } = await request.json() as ChatRequest;
                if (!message || typeof message !== "string") {
                    return new Response(JSON.stringify({ error: "Missing message" }), {
                        status: 400,
                        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                    });
                }
                const id = env.SESSIONS.idFromName(sid);
                const stub = env.SESSIONS.get(id);
                const res = await stub.fetch("https://do/agent/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message, model: model || env.MODEL }),
                });
                const reply = await res.json();
                return new Response(JSON.stringify(reply), {
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Set-Cookie": setCookie("sid", sid) },
                });
            } catch (error: any) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                });
            }
        }

        if (url.pathname === "/api/agent/stream" && request.method === "POST") {
            try {
                const { message, model } = await request.json() as ChatRequest;
                if (!message) return new Response("Missing message", { status: 400 });
                const id = env.SESSIONS.idFromName(sid);
                const stub = env.SESSIONS.get(id);
                const res = await stub.fetch("https://do/agent/stream", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message, model: model || env.MODEL }),
                });
                const headers = new Headers(res.headers);
                headers.set("Set-Cookie", setCookie("sid", sid));
                headers.set("Access-Control-Allow-Origin", "*");
                return new Response(res.body, { headers });
            } catch (error: any) {
                return new Response(`data: ${JSON.stringify({ error: error.message })}\n\n`, {
                    status: 500,
                    headers: { "Content-Type": "text/event-stream", ...CORS_HEADERS },
                });
            }
        }

        if (url.pathname === "/api/agent/reset" && request.method === "POST") {
            const id = env.SESSIONS.idFromName(sid);
            const stub = env.SESSIONS.get(id);
            await stub.fetch("https://do/reset", { method: "POST" });
            return new Response("ok", { headers: { ...CORS_HEADERS, "Set-Cookie": setCookie("sid", sid) } });
        }

        if (url.pathname === "/") {
            const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Edge Helpdesk AI</title></head>
<body style="font-family:system-ui;max-width:800px;margin:50px auto;padding:20px">
<h1>🤖 Edge Helpdesk AI</h1>
<p>Worker API is ready. Available endpoints:</p>
<ul>
<li><code>POST /api/agent/chat</code> - Send messages (JSON)</li>
<li><code>POST /api/agent/stream</code> - SSE streaming</li>
<li><code>POST /api/agent/reset</code> - Reset session</li>
<li><code>GET /api/healthz</code> - Health check</li>
</ul>
<p>Deploy the React app from <code>app/</code> to Cloudflare Pages.</p>
</body></html>`;
            return new Response(html, { headers: { "Content-Type": "text/html" } });
        }

        return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    },
};

export class SessionDO {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname.endsWith("/reset") && request.method === "POST") {
            await this.state.storage.deleteAll();
            return new Response("ok");
        }

        if (url.pathname.endsWith("/agent/chat") && request.method === "POST") {
            const { message, model } = await request.json() as ChatRequest;
            const history: Array<{ role: "user" | "assistant"; content: string }> =
                (await this.state.storage.get("history")) || [];

            try {
                const result = await runAgent({
                    env: this.env,
                    model: model || "@cf/meta/llama-3.1-8b-instruct",
                    history,
                }, message);

                const reply = result.response || "Sorry, no response.";
                history.push({ role: "user", content: message });
                history.push({ role: "assistant", content: reply });
                await this.state.storage.put("history", history);

                return new Response(
                    JSON.stringify({ reply }),
                    { headers: { "Content-Type": "application/json" } }
                );
            } catch (error: any) {
                console.error("Agent error:", error);
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        if (url.pathname.endsWith("/agent/stream") && request.method === "POST") {
            const { message, model } = await request.json() as ChatRequest;
            const history: Array<{ role: "user" | "assistant"; content: string }> =
                (await this.state.storage.get("history")) || [];

            const self = this;
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        const result = await runAgent({
                            env: self.env,
                            model: model || "@cf/meta/llama-3.1-8b-instruct",
                            history,
                        }, message);

                        const reply = result.response || "Sorry, no response.";

                        // Stream word by word
                        const words = reply.split(" ");
                        for (let i = 0; i < words.length; i++) {
                            const chunk = words[i] + (i < words.length - 1 ? " " : "");
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk })}\n\n`));
                        }

                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
                        );

                        history.push({ role: "user", content: message });
                        history.push({ role: "assistant", content: reply });
                        await self.state.storage.put("history", history);
                        controller.close();
                    } catch (error: any) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
                        controller.close();
                    }
                },
            });

            return new Response(stream, {
                headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
            });
        }

        return new Response("Not found", { status: 404 });
    }
}