// Zips dist/ into marketlens-hostinger.zip for upload via cPanel / hPanel File Manager.
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const out = 'marketlens-hostinger.zip';
if (existsSync(out)) rmSync(out);
// Runtime data (cache, IPO history) is created on the server and must not be overwritten.
execSync(`cd dist && zip -qr ../${out} . -x 'api/data/*.json' 'api/data/cache/*' 'api/config.local.php'`, { stdio: 'inherit' });
console.log(`Created ${out} — upload and extract it into public_html (see README → Deploy to Hostinger).`);
