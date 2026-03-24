import http from 'http';

const TARGET = process.env.GRAPHQL_TARGET || 'http://100.125.77.118:4001/graphql';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then(r => r.text())
      .then(t => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(t); })
      .catch(e => { console.error('Proxy error:', e.message); res.writeHead(502).end(e.message); });
  });
}).listen(4001, '0.0.0.0', () => {
  console.log(`GraphQL proxy :4001 → ${TARGET}`);
});
