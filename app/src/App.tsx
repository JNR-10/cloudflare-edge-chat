import React, { useState } from 'react';
import Chat from './components/Chat';

function App() {
  const [modelName, setModelName] = useState('@cf/meta/llama-3.1-8b-instruct');
  const [sessionKey, setSessionKey] = useState(0);
  const [memoryBanner, setMemoryBanner] = useState<Record<string, string> | null>(null);

  const handleNewSession = async () => {
    try {
      await fetch('/api/agent/reset', { method: 'POST' });
      setSessionKey(prev => prev + 1);
      setMemoryBanner(null);
    } catch (error) {
      console.error('Failed to reset session:', error);
    }
  };

  const handleMemoryUpdate = (delta: Record<string, string>) => {
    setMemoryBanner(delta);
    setTimeout(() => setMemoryBanner(null), 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🤖 Edge Helpdesk AI
          </h1>
          <p className="text-gray-600 text-sm">
            Powered by Cloudflare Workers AI • Llama 3.1 • Agents SDK
          </p>

          {/* Controls */}
          <div className="mt-4 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="@cf/meta/llama-3.1-8b-instruct">
                  Llama 3.1 8B (Fast)
                </option>
                <option value="@cf/meta/llama-3.1-70b-instruct">
                  Llama 3.1 70B (Better)
                </option>
              </select>
            </div>

            <button
              onClick={handleNewSession}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium"
            >
              New Session
            </button>
          </div>

          {/* Memory Banner */}
          {memoryBanner && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-md">
              <p className="text-sm text-green-800">
                ✅ <strong>Saved to memory:</strong>{' '}
                {Object.entries(memoryBanner).map(([k, v]) => `${k}="${v}"`).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Chat Component */}
        <Chat
          key={sessionKey}
          modelName={modelName}
          onMemoryUpdate={handleMemoryUpdate}
        />

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Try: "My name is John" • "What's in the FAQ?" • "Search example.com"
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;