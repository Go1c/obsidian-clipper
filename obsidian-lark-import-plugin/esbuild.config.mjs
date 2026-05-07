import { context } from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions = {
	entryPoints: ['src/main.ts'],
	outfile: 'main.js',
	bundle: true,
	format: 'cjs',
	platform: 'node',
	target: 'es2022',
	sourcemap: true,
	logLevel: 'info',
	external: ['obsidian'],
};

const ctx = await context(buildOptions);

if (watch) {
	await ctx.watch();
} else {
	await ctx.rebuild();
	await ctx.dispose();
}
