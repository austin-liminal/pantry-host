import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();

if (process.argv.includes('--http')) {
  const PORT = parseInt(process.env.MCP_PORT ?? '5001', 10);
  const API_KEY = process.env.MCP_API_KEY;

  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { createServer: createHttpServer } = await import('node:http');
  const { randomUUID } = await import('node:crypto');

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
  });

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

    // Route /mcp to the transport
    if (req.url === '/mcp' || req.url === '/') {
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  });

  await server.connect(transport);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.error(`PantryHost MCP server (HTTP) listening on http://0.0.0.0:${PORT}/mcp`);
    if (API_KEY) console.error('API key authentication enabled');
  });
} else {
  // Default: stdio transport (for Claude Desktop, etc.)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PantryHost MCP server running on stdio');
}
