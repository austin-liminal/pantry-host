# Upgrade feed.pantryhost.app: Cloudflare Cron → Firehose VPS

> **Status as of 2026-04-16:** SHIPPED. This doc is retained as the historical design record; the implementation landed on Fly.io (not Hetzner) and expanded the HTTP surface beyond what's described here. See `packages/feed/src/server.ts` for the live code and `CLAUDE.md`'s `packages/feed` section for the current `/api/*` surface (recipes with cursor pagination, handles, recipe URL proxy, OSM markets).

## When to run this plan

After `feature/atproto` merges to main and the Bluesky integration
ships to users. The current Cloudflare Worker + Cron setup works
but depends on recipe.exchange for handle discovery. This plan
makes us fully independent.

## Why

The current architecture scrapes recipe.exchange's HTML pages to
discover new AT Protocol recipe publishers. This means:

- We only find publishers recipe.exchange already indexed
- If recipe.exchange goes down, we stop discovering new publishers
- We're limited to the first 5 pages (~300 recipes) of their site
- A fresh user who publishes a recipe won't appear in our registry
  until recipe.exchange indexes them AND our cron scrapes the page
  they appear on

The firehose approach subscribes directly to the AT Protocol relay
and sees every `exchange.recipe.recipe` create event in real-time.
Zero dependency on any third party.

## Architecture

```
AT Protocol Relay (wss://bsky.network)
    ↓ persistent WebSocket subscription
    ↓ filter for exchange.recipe.recipe creates
    ↓
VPS ($5/mo Hetzner, Fly.io, or Railway)
    ↓ Node.js process managed by pm2
    ↓ upserts DID + handle into SQLite
    ↓
feed.pantryhost.app (same domain, new origin)
    ↓ serves GET /api/handles from SQLite
    ↓ Cloudflare DNS proxied to VPS IP
```

### What changes

| Component | Current (Cloudflare) | New (VPS) |
|-----------|---------------------|-----------|
| Discovery | Scrape recipe.exchange HTML | Firehose subscription (real-time) |
| Storage | Cloudflare D1 (SQLite) | SQLite on VPS |
| API server | Cloudflare Worker | Express/Hono on VPS |
| Cron | CF Cron Trigger (15 min) | Not needed — firehose is real-time |
| Cost | Free | ~$5/mo |
| Independence | Depends on recipe.exchange | Fully independent |
| Latency | Up to 15 min for new publishers | Seconds |

### What stays the same

- Domain: `feed.pantryhost.app`
- API: `GET /api/handles` (same response shape)
- Data model: only DIDs + handles, never recipe content
- AT Protocol compliance: deletions honored, no content stored
- Client fallback: `SEED_HANDLES` if API unreachable

## VPS setup

### 1. Provision

```bash
# Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) — $4.50/mo
# Or Fly.io free tier (256MB, shared CPU) — $0 for light usage
# Or Railway — ~$5/mo with usage-based billing
```

### 2. Install dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
npm install -g pm2
```

### 3. Deploy the indexer

```bash
git clone https://github.com/jpdevries/pantry-host.git
cd pantry-host/packages/feed
npm install
```

### 4. New source files

Replace the Cloudflare Worker with a Node.js server:

#### `packages/feed/src/server.ts`

```typescript
import express from 'express';
import Database from 'better-sqlite3';
import { Subscription } from '@atproto/xrpc-server';
import { ids } from './lexicons';

const PORT = process.env.PORT || 3002;
const DB_PATH = process.env.DB_PATH || './data/registry.db';
const FIREHOSE_URL = 'wss://bsky.network';
const LEXICON_RECIPE = 'exchange.recipe.recipe';

// ── Database ─────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS recipe_publishers (
    did TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    recipe_count INTEGER DEFAULT 0,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS cursor (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seq INTEGER NOT NULL
  )
`);

function getCursor(): number | undefined {
  const row = db.prepare('SELECT seq FROM cursor WHERE id = 1').get();
  return row?.seq;
}

function setCursor(seq: number) {
  db.prepare(
    'INSERT INTO cursor (id, seq) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET seq = ?'
  ).run(seq, seq);
}

function upsertPublisher(did: string, handle: string) {
  db.prepare(`
    INSERT INTO recipe_publishers (did, handle, recipe_count, last_seen)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(did) DO UPDATE SET
      handle = excluded.handle,
      recipe_count = recipe_count + 1,
      last_seen = datetime('now')
  `).run(did, handle);
}

// ── Firehose subscription ────────────────────────────────────

async function resolveHandle(did: string): Promise<string> {
  try {
    const res = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${did}`
    );
    if (res.ok) {
      const body = await res.json();
      return body.handle || did;
    }
  } catch {}
  return did;
}

async function startFirehose() {
  const cursor = getCursor();
  console.log(`[firehose] Starting from cursor: ${cursor ?? 'latest'}`);

  const sub = new Subscription({
    service: FIREHOSE_URL,
    method: ids.ComAtprotoSyncSubscribeRepos,
    getParams: () => ({ cursor }),
    validate: (body) => body, // skip validation for speed
  });

  for await (const event of sub) {
    if (event.$type !== '#commit') continue;

    for (const op of event.ops || []) {
      if (
        op.action === 'create' &&
        op.path?.startsWith(`${LEXICON_RECIPE}/`)
      ) {
        const handle = await resolveHandle(event.repo);
        upsertPublisher(event.repo, handle);
        console.log(`[firehose] New recipe from @${handle}`);
      }
    }

    // Persist cursor every event for crash recovery
    if (event.seq) setCursor(event.seq);
  }
}

// ── HTTP API ─────────────────────────────────────────────────

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'feed.pantryhost.app' });
});

app.get('/api/handles', (req, res) => {
  const rows = db.prepare(
    'SELECT did, handle, recipe_count FROM recipe_publishers WHERE recipe_count > 0 ORDER BY recipe_count DESC'
  ).all();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`[api] Listening on port ${PORT}`);
  startFirehose().catch((err) => {
    console.error('[firehose] Fatal error:', err);
    process.exit(1);
  });
});
```

#### Dependencies

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "@atproto/xrpc-server": "^0.6.0"
  }
}
```

### 5. Run with pm2

```bash
pm2 start "npx tsx src/server.ts" --name feed-pantryhost
pm2 save && pm2 startup
```

### 6. Update DNS

Change the Cloudflare DNS record for `feed.pantryhost.app`:
- Current: A record → `192.0.2.1` (proxied to CF Worker)
- New: A record → VPS public IP (still proxied through CF for HTTPS)

### 7. Decommission Cloudflare Worker

```bash
npx wrangler delete feed-pantryhost
npx wrangler d1 delete recipe-publishers
```

## Migration checklist

- [ ] Provision VPS
- [ ] Deploy server.ts with pm2
- [ ] Seed the SQLite DB from current D1 data (one-time export)
- [ ] Update Cloudflare DNS A record to VPS IP
- [ ] Verify `feed.pantryhost.app/api/handles` returns data
- [ ] Verify firehose is receiving events (check pm2 logs)
- [ ] Monitor for 24 hours — confirm new publishers appear
- [ ] Delete Cloudflare Worker + D1 database
- [ ] Update wrangler.toml or remove packages/feed/wrangler.toml

## Rollback

If the VPS has issues, revert the DNS A record to `192.0.2.1` and
the Cloudflare Worker takes over again. The CF Worker can remain
deployed as a cold standby — it still runs its cron independently.

## Cost

- Hetzner CX22: €4.35/mo (~$4.50)
- Domain: already owned (pantryhost.app)
- Cloudflare proxy: free (DNS only, no Worker compute)
- Total: ~$5/mo
