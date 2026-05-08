import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
	const options = {
		root: process.cwd(),
		out: undefined,
		skipBuild: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--skip-build') {
			options.skipBuild = true;
		} else if (arg === '--root') {
			options.root = argv[++index];
		} else if (arg === '--out') {
			options.out = argv[++index];
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	options.root = resolve(options.root);
	options.out = resolve(options.out ?? join(options.root, 'release'));
	return options;
}

async function assertFile(path, label) {
	let fileStat;
	try {
		fileStat = await stat(path);
	} catch {
		throw new Error(`${label} is missing: ${path}`);
	}

	if (!fileStat.isFile()) {
		throw new Error(`${label} must be a file: ${path}`);
	}
}

async function assertDirectory(path, label) {
	let dirStat;
	try {
		dirStat = await stat(path);
	} catch {
		throw new Error(`${label} is missing: ${path}`);
	}

	if (!dirStat.isDirectory()) {
		throw new Error(`${label} must be a directory: ${path}`);
	}
}

async function readManifest(pluginDir) {
	const manifestPath = join(pluginDir, 'manifest.json');
	await assertFile(manifestPath, 'Obsidian plugin manifest');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

	if (!manifest.version || typeof manifest.version !== 'string') {
		throw new Error('Obsidian plugin manifest must include a string version.');
	}

	return manifest;
}

async function run(command, args, cwd) {
	console.log(`> ${command} ${args.join(' ')}`);
	await execFileAsync(command, args, { cwd, stdio: 'inherit' });
}

async function runBuilds(root) {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	await run(npm, ['run', 'build:chrome'], root);
	await run(npm, ['--prefix', 'obsidian-lark-import-plugin', 'run', 'package'], root);
}

async function copyFileEnsuringDirectory(source, destination) {
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination);
}

async function copyOptional(source, destination) {
	try {
		await assertFile(source, basename(source));
	} catch {
		return false;
	}

	await copyFileEnsuringDirectory(source, destination);
	return true;
}

async function compressDirectory(sourceDir, destinationZip) {
	await assertDirectory(sourceDir, 'ZIP source directory');
	await mkdir(dirname(destinationZip), { recursive: true });

	const command = '& { param($sourceDir, $destinationZip) Compress-Archive -Path (Join-Path $sourceDir "*") -DestinationPath $destinationZip -Force }';
	await execFileAsync('powershell.exe', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-Command',
		command,
		sourceDir,
		destinationZip,
	]);
}

async function stageObsidianPlugin(pluginDir) {
	const stageDir = await mkdtemp(join(tmpdir(), 'lark-local-import-'));
	for (const fileName of ['manifest.json', 'main.js', 'README.md']) {
		await copyFileEnsuringDirectory(join(pluginDir, fileName), join(stageDir, fileName));
	}

	await copyOptional(join(pluginDir, 'styles.css'), join(stageDir, 'styles.css'));
	return stageDir;
}

async function packageRelease() {
	const options = parseArgs(process.argv.slice(2));
	const browserDist = join(options.root, 'dist');
	const pluginDir = join(options.root, 'obsidian-lark-import-plugin');
	const manifest = await readManifest(pluginDir);

	if (!options.skipBuild) {
		await runBuilds(options.root);
	}

	await assertFile(join(pluginDir, 'main.js'), 'Obsidian plugin main.js');
	await assertFile(join(pluginDir, 'README.md'), 'Obsidian plugin README');
	await assertFile(join(browserDist, 'manifest.json'), 'Chrome extension manifest');

	await mkdir(options.out, { recursive: true });

	await copyFileEnsuringDirectory(join(pluginDir, 'manifest.json'), join(options.root, 'manifest.json'));
	await copyFileEnsuringDirectory(join(pluginDir, 'main.js'), join(options.root, 'main.js'));
	await copyFileEnsuringDirectory(join(pluginDir, 'manifest.json'), join(options.out, 'manifest.json'));
	await copyFileEnsuringDirectory(join(pluginDir, 'main.js'), join(options.out, 'main.js'));
	await copyFileEnsuringDirectory(join(pluginDir, 'README.md'), join(options.out, 'README.md'));
	await copyOptional(join(pluginDir, 'styles.css'), join(options.root, 'styles.css'));
	await copyOptional(join(pluginDir, 'styles.css'), join(options.out, 'styles.css'));

	const chromeZip = join(options.out, `lark-web-clipper-chrome-v${manifest.version}.zip`);
	const obsidianZip = join(options.out, `lark-local-import-v${manifest.version}.zip`);

	await compressDirectory(browserDist, chromeZip);

	const obsidianStage = await stageObsidianPlugin(pluginDir);
	try {
		await compressDirectory(obsidianStage, obsidianZip);
	} finally {
		await rm(obsidianStage, { recursive: true, force: true });
	}

	console.log(`Release assets written to ${options.out}`);
}

packageRelease().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
