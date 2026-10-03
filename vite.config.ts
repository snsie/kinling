import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Emits sw.js with a precache list of every built asset so the game shell
 * works offline after the first visit. Model files are cached by WebLLM itself.
 */
function serviceWorker(): Plugin {
  return {
    name: 'kinling-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // The WebLLM runtime chunks (~6 MB each) are only needed once AI is turned on;
      // they are cached at runtime on first use instead of on every first visit.
      const sizeOf = (f: string) => {
        const item = bundle[f]!;
        return item.type === 'chunk' ? item.code.length : typeof item.source === 'string' ? item.source.length : item.source.byteLength;
      };
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js' && sizeOf(f) < 2_000_000);
      const publicFiles = listFiles('public').map((f) => relative('public', f).split('\\').join('/'));
      const files = ['./', ...[...built, ...publicFiles].map((f) => `./${f}`)];
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync('src/sw/sw-template.js', 'utf8');
      const source = template.replace('__PRECACHE__', JSON.stringify(files)).replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 7000,
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
});
