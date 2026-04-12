/**
 * feed.pantryhost.app — AT Protocol Handle Registry
 *
 * A Cloudflare Worker that maintains a registry of Bluesky accounts
 * that have published exchange.recipe.recipe records. Stores only
 * DIDs and handles — never recipe content. Recipe data is always
 * fetched live from the author's PDS at browse time.
 *
 * Cron: every 15 minutes
 *   1. Scrape recipe.exchange/recipes pages for new handles
 *   2. Poll listRecords for each known handle to update recipe_count
 *   3. Handles with 0 recipes are excluded from the API response
 *
 * API: GET /api/handles → JSON array of active recipe publishers
 */

interface Env {
	DB: D1Database;
	CORS_ORIGIN: string;
}

const BSKY_XRPC = 'https://bsky.social/xrpc';
const RECIPE_EXCHANGE_BASE = 'https://recipe.exchange';
const LEXICON_RECIPE = 'exchange.recipe.recipe';

// Seed handles — bootstraps the registry on first run
const SEED_HANDLES = [
	'joshhuckabee.com',
	'recipe.exchange',
	'pixeline.be',
	'stephenhunter.xyz',
	'bmann.ca',
	'rdur.dev',
	'isaaccorbrey.com',
	'baileytownsend.dev',
	'nick.mcmanus.tech',
	'western-red-cedar.bsky.social',
];

// ── Helpers ──────────────────────────────────────────────────────────

async function resolveHandle(handle: string): Promise<string | null> {
	try {
		const res = await fetch(
			`${BSKY_XRPC}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
		);
		if (!res.ok) return null;
		const body = (await res.json()) as { did: string };
		return body.did;
	} catch {
		return null;
	}
}

async function countRecipes(repo: string): Promise<number> {
	try {
		const res = await fetch(
			`${BSKY_XRPC}/com.atproto.repo.listRecords?repo=${encodeURIComponent(repo)}&collection=${LEXICON_RECIPE}&limit=1`
		);
		if (!res.ok) return 0;
		const body = (await res.json()) as { records: unknown[] };
		// listRecords doesn't return a total count — we need to paginate
		// For efficiency, just check if records exist (count > 0)
		return body.records?.length > 0 ? await fullCount(repo) : 0;
	} catch {
		return 0;
	}
}

async function fullCount(repo: string): Promise<number> {
	let count = 0;
	let cursor: string | undefined;
	do {
		const params = new URLSearchParams({
			repo,
			collection: LEXICON_RECIPE,
			limit: '100',
		});
		if (cursor) params.set('cursor', cursor);
		try {
			const res = await fetch(`${BSKY_XRPC}/com.atproto.repo.listRecords?${params}`);
			if (!res.ok) break;
			const body = (await res.json()) as { records: unknown[]; cursor?: string };
			count += body.records.length;
			cursor = body.cursor;
		} catch {
			break;
		}
	} while (cursor);
	return count;
}

async function discoverHandles(): Promise<string[]> {
	const handles = new Set<string>();
	// Scrape first 5 pages of recipe.exchange for profile links
	for (let page = 1; page <= 5; page++) {
		try {
			const res = await fetch(`${RECIPE_EXCHANGE_BASE}/recipes?page=${page}`);
			if (!res.ok) break;
			const html = await res.text();
			const matches = html.matchAll(/\/profiles\/([^"]+)/g);
			for (const m of matches) {
				const handle = m[1];
				if (handle && !handle.includes('/')) handles.add(handle);
			}
		} catch {
			break;
		}
		// Be polite to recipe.exchange
		await new Promise((r) => setTimeout(r, 1000));
	}
	return Array.from(handles);
}

// ── Cron handler ─────────────────────────────────────────────────────

async function handleCron(env: Env) {
	const db = env.DB;

	// Ensure table exists
	// Table created via: npx wrangler d1 execute recipe-publishers --remote --command="CREATE TABLE IF NOT EXISTS recipe_publishers (...)"

	// 1. Discover new handles from recipe.exchange
	const discovered = await discoverHandles();

	// 2. Merge with seeds + existing
	const { results: existing } = await db
		.prepare('SELECT handle FROM recipe_publishers')
		.all<{ handle: string }>();
	const existingHandles = new Set(existing.map((r) => r.handle));

	const allHandles = new Set([
		...SEED_HANDLES,
		...discovered,
		...existingHandles,
	]);

	// 3. For each handle, resolve DID and count recipes
	for (const handle of allHandles) {
		const did = await resolveHandle(handle);
		if (!did) continue;

		const count = await countRecipes(did);

		await db
			.prepare(
				`INSERT INTO recipe_publishers (did, handle, recipe_count, last_seen)
				 VALUES (?, ?, ?, datetime('now'))
				 ON CONFLICT(did) DO UPDATE SET
					handle = excluded.handle,
					recipe_count = excluded.recipe_count,
					last_seen = datetime('now')`
			)
			.bind(did, handle, count)
			.run();

		// Rate limit: don't hammer bsky.social
		await new Promise((r) => setTimeout(r, 200));
	}
}

// ── HTTP handler ─────────────────────────────────────────────────────

async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const corsHeaders = {
		'Access-Control-Allow-Origin': env.CORS_ORIGIN,
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	if (url.pathname === '/api/handles' && request.method === 'GET') {
		try {
			// Table pre-created via wrangler d1 execute --remote
			const { results } = await env.DB
				.prepare(
					'SELECT did, handle, recipe_count FROM recipe_publishers WHERE recipe_count > 0 ORDER BY recipe_count DESC'
				)
				.all<{ did: string; handle: string; recipe_count: number }>();

			return new Response(JSON.stringify(results), {
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json',
					'Cache-Control': 'public, max-age=900', // 15 min CDN cache
				},
			});
		} catch (err) {
			return new Response(
				JSON.stringify({ error: 'Internal error', message: (err as Error).message }),
				{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}
	}

	// Health check
	if (url.pathname === '/' || url.pathname === '/health') {
		return new Response(JSON.stringify({ status: 'ok', service: 'feed.pantryhost.app' }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
		});
	}

	return new Response('Not Found', { status: 404, headers: corsHeaders });
}

// ── Export ────────────────────────────────────────────────────────────

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return handleRequest(request, env);
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(handleCron(env));
	},
};
