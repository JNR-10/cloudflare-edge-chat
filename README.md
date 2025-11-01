# Edge Helpdesk AI — Cloudflare Workers AI + Agents SDK + Durable Objects

A full-stack AI helpdesk application running on **Cloudflare Workers** with:
- **Workers AI** (Llama 3.3) for LLM responses
- **Agents SDK** for tool orchestration
- **Durable Objects** with SQLite for per-session memory
- **React + Vite** frontend with SSE streaming
- **Tools**: `searchSite`, `getFAQ`, `saveMemory`, `recallMemory`

## Features

✅ **Agent-based architecture** with 4 tools  
✅ **Per-session memory** using Durable Objects + SQLite  
✅ **Server-Sent Events (SSE)** for streaming tokens  
✅ **Model selection** (Llama 3.3 8B / 70B FP8)  
✅ **React UI** with Tailwind CSS  
✅ **Session management** (New Session button)  

## Architecture

```
┌─────────────────┐
│  React Frontend │  (Vite, Tailwind CSS)
│   (Port 5173)   │
└────────┬────────┘
         │ HTTP/SSE
         ▼
┌─────────────────┐
│ Cloudflare      │  POST /api/agent/chat
│ Worker          │  POST /api/agent/stream (SSE)
│ (Port 8787)     │  POST /api/agent/reset
└────────┬────────┘  GET  /api/healthz
         │
         ├─► Agents SDK ──► Workers AI (Llama 3.3)
         │
         └─► Durable Object (SessionDO)
             ├─► Conversation history (DO storage)
             └─► Key-value memory (SQLite)
```

## Prerequisites

1. **Node.js** 18+ and npm
2. **Cloudflare account** with Workers AI enabled
3. **Wrangler CLI** (installed automatically with npm install)

## Setup Instructions

### 1. Install Backend Dependencies

```bash
cd /Users/spartan/Downloads/cloudflare-edge-chat
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser to authorize Wrangler.

### 3. Start the Worker (Backend)

```bash
npm run dev
```

The Worker runs on **http://localhost:8787**. Keep this terminal open.

### 4. Install Frontend Dependencies

In a **new terminal**:

```bash
cd app
npm install
```

### 5. Start the Frontend

```bash
npm run dev
```

The React app runs on **http://localhost:5173**. It proxies `/api/*` to the Worker.

### 6. Open the App

Visit **http://localhost:5173** in your browser.

## Testing Checklist

### ✅ Basic Chat
1. Send "Hello!" → Should get a friendly response
2. Ask "What's 2+2?" → Should get "4"

### ✅ Memory Tools
1. Say "My name is Alice"
   - Watch for green banner: "Saved to memory: name=\"Alice\""
2. In next message, ask "What's my name?"
   - Agent should recall "Alice"

### ✅ Session Reset
1. Click **New Session** button
2. Ask "What's my name?" → Agent shouldn't remember

### ✅ FAQ Tool
1. Ask "What's in the FAQ?"
   - Agent should call `getFAQ()` and list questions
   - Check "🔧 Used: getFAQ" badge under response

### ✅ Search Tool
1. Say "Search example.com"
   - Agent should call `searchSite("https://example.com")`
   - Returns extracted text (up to 2000 chars)
2. Try "Search github.com" → Should fail (not in allowlist)

### ✅ Model Switch
1. Change model dropdown to "Llama 3.3 70B FP8 (Better)"
2. Send a message → Should use 70B model (may be slower)

### ✅ Streaming
1. Ensure "Enable SSE streaming" checkbox is checked
2. Send a message → Watch tokens appear word-by-word
3. Uncheck streaming → Fallback to JSON response (instant)

### ✅ Health Check
1. Visit **http://localhost:8787/api/healthz** → Should return "ok"

## Configuration

### Environment Variables

You can override the default model via `wrangler.toml`:

```toml
[vars]
MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
```

### Allowed Domains (searchSite)

Edit `src/agent.ts` line 5 to add/remove allowed domains:

```typescript
const ALLOWED_DOMAINS = [
  "example.com",
  "cloudflare.com",
  "workers.dev",
  "wikipedia.org",
];
```

## Deployment

### Deploy Worker (Backend)

```bash
npm run deploy
```

This publishes to `https://edge-helpdesk.<your-subdomain>.workers.dev`.

### Deploy Frontend (Cloudflare Pages)

1. **Build the frontend**:
   ```bash
   cd app
   npm run build
   ```
   This creates `app/dist/`.

2. **Create a Pages project**:
   ```bash
   npx wrangler pages deploy dist --project-name=edge-helpdesk-ui
   ```

3. **Configure API endpoint**:
   - In `app/vite.config.ts`, update the proxy target to your deployed Worker URL:
     ```typescript
     target: 'https://edge-helpdesk.<your-subdomain>.workers.dev',
     ```
   - Or set `VITE_API_URL` environment variable in Pages settings.

4. **Visit**: `https://edge-helpdesk-ui.pages.dev`

## Project Structure

```
.
├── src/
│   ├── index.ts         # Worker entry, routes, SessionDO
│   ├── agent.ts         # Agents SDK + tools
│   └── utils.ts         # nanoid helper
├── app/
│   ├── src/
│   │   ├── App.tsx           # Main app (model selector, session reset)
│   │   ├── components/
│   │   │   └── Chat.tsx      # Chat UI with SSE streaming
│   │   ├── main.tsx          # React entry
│   │   └── index.css         # Tailwind imports
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── package.json
├── wrangler.toml
├── tsconfig.json
└── README.md
```

## API Endpoints

### `POST /api/agent/chat`
**Request:**
```json
{
  "message": "Hello!",
  "model": "@cf/meta/llama-3.3-8b-instruct"
}
```

**Response:**
```json
{
  "reply": "Hi! How can I help you?",
  "tools_used": ["getFAQ"],
  "memory_delta": { "name": "Alice" }
}
```

### `POST /api/agent/stream` (SSE)
**Request:** Same as `/api/agent/chat`

**Response:** Server-Sent Events
```
data: {"token":"Hi"}
data: {"token":" there!"}
data: {"done":true,"tools_used":["getFAQ"]}
```

### `POST /api/agent/reset`
Resets session memory and conversation history.

### `GET /api/healthz`
Returns "ok" (health check).

## Tools

| Tool | Description |
|------|-------------|
| `searchSite(url)` | Fetches and extracts text from allowed domains |
| `getFAQ()` | Returns FAQ list |
| `saveMemory(key, value)` | Stores key-value in session SQLite |
| `recallMemory(key)` | Retrieves value by key |

## Troubleshooting

### Worker fails to start
- Run `npx wrangler login` to authenticate
- Check Workers AI is enabled in your Cloudflare dashboard

### "Module not found" errors
- Run `npm install` in both root and `app/` directories

### Frontend can't reach API
- Ensure Worker is running on `http://localhost:8787`
- Check `app/vite.config.ts` proxy settings

### Streaming doesn't work
- Some environments don't support SSE; uncheck "Enable SSE streaming"

### Memory not persisting
- Durable Objects are created per session cookie (`sid`)
- Clear cookies or click "New Session" to reset

## Optional: Voice (Realtime)

This is a **stretch goal**. To add voice:
1. Use Cloudflare Realtime API for audio streaming
2. Add microphone button in `Chat.tsx`
3. Send audio to Realtime endpoint → transcribe → route to Agent
4. Return TTS audio for agent responses

See [Cloudflare Realtime docs](https://developers.cloudflare.com/workers-ai/realtime/) for implementation.

## License

MIT