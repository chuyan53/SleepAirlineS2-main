import esbuild from 'esbuild';
import { mkdirSync, rmSync } from 'fs';
import { dirname } from 'path';

const outfile = 'api/index.js';

rmSync('api', { recursive: true, force: true });
mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: ['handlers/catchall.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['@notionhq/client', 'dotenv', 'express', 'openai'],
});

console.log(`Built ${outfile}`);
