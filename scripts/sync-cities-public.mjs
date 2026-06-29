import { copyFileSync, existsSync, statSync } from 'fs';

const src = 'src/data/cities_data.json';
const dest = 'public/cities_data.json';

if (!existsSync(src)) {
  console.warn('sync-cities-public: missing', src);
  process.exit(0);
}

if (!existsSync(dest) || statSync(src).mtimeMs > statSync(dest).mtimeMs) {
  copyFileSync(src, dest);
  console.log('sync-cities-public: copied →', dest);
}
