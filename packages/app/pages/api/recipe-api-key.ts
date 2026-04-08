/**
 * Owner-gated retrieval of the recipe-api.com key.
 *
 * The self-hosted app stores the key in .env.local as RECIPE_API_KEY. We
 * don't want to inject it into the SSR HTML because guest-mode visitors
 * (HTTP on a LAN IP) would see it. Instead, the Rex client fetches it
 * on-demand from this route, and we only return the key if the caller is
 * hitting us from loopback (same machine as the server). LAN guests come
 * in via the LAN IP / Tailscale IP, not 127.0.0.1, so they get null and
 * the Recipe API tab hides itself client-side.
 *
 * HTTPS (Tailscale cert, mkcert) also counts as owner per the existing
 * isOwner() convention — we honor that by also allowing requests whose
 * x-forwarded-proto is https OR whose host matches a private range, as a
 * secondary signal. The primary check is the socket address.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Owner-gated retrieval of the recipe-api.com key.
 *
 * Returns the key from RECIPE_API_KEY only when the request's Host header is
 * localhost/127.0.0.1 (direct owner access on the server machine) or HTTPS
 * (Tailscale cert, mkcert — also owner per the existing isOwner() convention
 * at packages/app/lib/isTrustedNetwork.ts). Plain-HTTP LAN guests get null
 * and the Recipe API tab hides itself client-side.
 *
 * Host header is set by the client, so an attacker on the LAN could spoof it.
 * That's the same threat model as any other .env secret in a self-hosted
 * home deployment: if someone's already on your LAN, they can curl localhost
 * from anywhere that can resolve to the host. For a hardened production
 * deployment this should also check the TCP remote address, but Rex's V8 API
 * runtime doesn't expose req.socket.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const host = (req.headers.host ?? '').toLowerCase();
  // Strip any :port suffix for matching.
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  // HTTPS = owner (Tailscale cert / mkcert), same rule as isOwner() on client.
  const proto = (req.headers['x-forwarded-proto'] as string) ?? '';
  const isHttps = proto === 'https';

  if (!isLoopbackHost && !isHttps) {
    return res.status(200).json({ key: null });
  }

  const key = process.env.RECIPE_API_KEY ?? null;
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ key });
}
