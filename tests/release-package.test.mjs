import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);

async function writeFixtureFile(path, contents) {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, contents);
}

test('package-release creates Chrome and BRAT release assets', async () => {
	const tempRoot = await mkdtemp(join(tmpdir(), 'larkdoc-release-test-'));
	const repoRoot = join(tempRoot, 'repo');
	const outDir = join(tempRoot, 'release');

	await writeFixtureFile(
		join(repoRoot, 'dist', 'manifest.json'),
		JSON.stringify({ manifest_version: 3, name: 'Lark Web Clipper' }),
	);
	await writeFixtureFile(
		join(repoRoot, 'dist', 'background.js'),
		'console.log("browser fixture");\n',
	);
	await writeFixtureFile(
		join(repoRoot, 'obsidian-lark-import-plugin', 'manifest.json'),
		JSON.stringify({
			id: 'lark-local-import',
			name: 'Lark Local Import',
			version: '0.1.0',
			minAppVersion: '1.5.0',
			description: 'fixture',
			author: 'fixture',
			isDesktopOnly: true,
		}),
	);
	await writeFixtureFile(
		join(repoRoot, 'obsidian-lark-import-plugin', 'main.js'),
		'console.log("obsidian fixture");\n',
	);
	await writeFixtureFile(
		join(repoRoot, 'obsidian-lark-import-plugin', 'README.md'),
		'# Lark Local Import\n',
	);

	const script = join(process.cwd(), 'scripts', 'package-release.mjs');
	await execFileAsync(process.execPath, [
		script,
		'--skip-build',
		'--root',
		repoRoot,
		'--out',
		outDir,
	]);

	for (const fileName of [
		'lark-web-clipper-chrome-v0.1.0.zip',
		'lark-local-import-v0.1.0.zip',
		'main.js',
		'manifest.json',
		'README.md',
	]) {
		const file = await stat(join(outDir, fileName));
		assert.equal(file.isFile(), true, `${fileName} should be a file`);
		assert.ok(file.size > 0, `${fileName} should not be empty`);
	}

	const mirroredManifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'));
	assert.equal(mirroredManifest.version, '0.1.0');
});
