import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * After the client build finishes, run the SSR build and the prerender
 * script. This lets a single `vite build` (the command Cloudflare Pages
 * runs) produce the fully prerendered dist/, instead of needing
 * `npm run build` to chain three commands.
 *
 * Skipped during the SSR build itself (otherwise infinite recursion) and
 * during dev (`vite serve`).
 */
function prerenderPlugin(): Plugin {
  let didRun = false;
  return {
    name: 'pantry-host-prerender',
    apply: 'build',
    closeBundle() {
      if (didRun) return;
      // @ts-expect-error config.build.ssr is set on SSR builds
      if (this.environment?.config?.build?.ssr || process.env.PANTRY_HOST_SSR_BUILD === '1') return;
      didRun = true;
      const root = __dirname;
      const prerenderScript = resolve(root, 'scripts/prerender.mjs');
      if (!existsSync(prerenderScript)) {
        this.warn('prerender.mjs not found, skipping SSR/prerender step');
        return;
      }
      console.log('\n[prerender] building SSR bundle...');
      execSync(
        'PANTRY_HOST_SSR_BUILD=1 npx vite build --ssr src/entry-server.tsx --outDir dist-ssr',
        { cwd: root, stdio: 'inherit' }
      );
      console.log('[prerender] generating static HTML...');
      execSync(`node ${JSON.stringify(prerenderScript)}`, { cwd: root, stdio: 'inherit' });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), ...(isSsrBuild ? [] : [prerenderPlugin()])],
  build: {
    rollupOptions: {
      output: isSsrBuild
        ? undefined
        : {
            manualChunks: {
              vendor: ['react', 'react-dom'],
            },
          },
    },
  },
}));
