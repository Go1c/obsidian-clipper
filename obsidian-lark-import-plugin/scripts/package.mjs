import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const packageDir = join(root, 'release', 'lark-local-import');

await rm(packageDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });

for (const filename of ['manifest.json', 'main.js', 'main.js.map', 'README.md']) {
	await cp(join(root, filename), join(packageDir, filename));
}

console.log(`Packaged Obsidian plugin at ${packageDir}`);
