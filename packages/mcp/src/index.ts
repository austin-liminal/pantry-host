import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

if (process.argv.includes('--http')) {
  const PORT = parseInt(process.env.MCP_PORT ?? '5001', 10);
  const API_KEY = process.env.MCP_API_KEY;

  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { createServer: createHttpServer } = await import('node:http');
  const { randomUUID } = await import('node:crypto');

  // Track active sessions: sessionId → { server, transport }
  const sessions = new Map<string, { server: ReturnType<typeof createServer>; transport: InstanceType<typeof StreamableHTTPServerTransport> }>();

  const httpServer = createHttpServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    // Auth check
    if (API_KEY) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${API_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    if (req.url !== '/mcp' && req.url !== '/') {
      res.writeHead(404).end('Not found');
      return;
    }

    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session — route to its transport
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
    } else if (req.method === 'POST' && !sessionId) {
      // New session — create a fresh server + transport pair
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
      });
      const server = createServer();
      await server.connect(transport);

      // Capture the session ID after the initialize response
      const origEnd = res.end.bind(res);
      const patchedEnd = function (...args: Parameters<typeof res.end>) {
        const newSessionId = res.getHeader('mcp-session-id') as string | undefined;
        if (newSessionId) {
          sessions.set(newSessionId, { server, transport });
          // Clean up on close
          transport.onclose = () => {
            sessions.delete(newSessionId);
          };
        }
        return origEnd(...args);
      };
      res.end = patchedEnd as typeof res.end;

      await transport.handleRequest(req, res);
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request: no valid session' }));
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.error(`PantryHost MCP server (HTTP) listening on http://0.0.0.0:${PORT}/mcp`);
    if (API_KEY) console.error('API key authentication enabled');
  });
} else {
  // Default: stdio transport (for Claude Desktop, etc.)
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PantryHost MCP server running on stdio');
}
