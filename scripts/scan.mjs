#!/usr/bin/env node
/*
 * n8n's own verification scan, run on this package before it is published.
 *
 * n8n checks every node submitted for verification with @n8n/scan-community-package: it
 * lints the source at the commit the npm provenance points to, and the compiled files in the
 * npm tarball, with inline eslint-disable comments ignored. This script runs the same two lint
 * legs with the scanner's own code (analyzePackage) on this folder and on the tarball
 * `npm pack` builds. Provenance itself only exists once GitHub Actions has published.
 *
 * The scanner is installed from scripts/scan.package-lock.json into a folder of its own
 * outside the project, without install scripts. It cannot be a dev dependency here: its tree
 * carries a second TypeScript whose `tsc` would take the place of this project's compiler.
 *
 *   npm run scan        builds, then scans
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(root, 'scripts', 'scan.package.json');
const lockfile = join(root, 'scripts', 'scan.package-lock.json');
const isWindows = process.platform === 'win32';

/** Runs a program and returns its output. npm is a .cmd file on Windows, so it needs the shell there. */
function run(command, args, cwd) {
	const useShell = isWindows && command === 'npm';
	const finalArgs = useShell ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args;
	const result = spawnSync(command, finalArgs, { cwd, encoding: 'utf8', shell: useShell });
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} failed in ${cwd}\n${result.stderr || result.stdout}`,
		);
	}
	return result.stdout;
}

if (!existsSync(join(root, 'dist', 'package.json'))) {
	console.error('No build found. Run "npm run scan", which builds first.');
	process.exit(1);
}

// 1. The scanner, installed once per lockfile into its own folder.
const lockHash = createHash('sha256').update(readFileSync(lockfile)).digest('hex').slice(0, 12);
const home = join(tmpdir(), `hproxy-n8n-scan-${lockHash}`);
const scannerDir = join(home, 'node_modules', '@n8n', 'scan-community-package');
if (!existsSync(join(scannerDir, 'package.json'))) {
	mkdirSync(home, { recursive: true });
	copyFileSync(manifest, join(home, 'package.json'));
	copyFileSync(lockfile, join(home, 'package-lock.json'));
	console.log(`Installing the scanner from scripts/scan.package-lock.json into ${home}`);
	run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], home);
}
const scannerVersion = JSON.parse(readFileSync(join(scannerDir, 'package.json'), 'utf8')).version;
// 0.41 keeps the scanner in scanner/scanner.mjs, later releases in dist/scanner.js.
const scannerEntry = ['scanner/scanner.mjs', 'dist/scanner.js']
	.map((file) => join(scannerDir, file))
	.find((file) => existsSync(file));
if (!scannerEntry) {
	console.error(
		`@n8n/scan-community-package ${scannerVersion} has no scanner module where this script looks.`,
	);
	process.exit(1);
}

// 2. The tarball npm would publish, unpacked, and both lint legs of the scan.
const packDir = mkdtempSync(join(tmpdir(), 'hproxy-n8n-pack-'));
let failed = false;
try {
	const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', packDir], root));
	run('tar', ['-xzf', packed.filename, '-C', packDir], packDir);
	const unpacked = join(packDir, 'package');

	console.log(`@n8n/scan-community-package ${scannerVersion}`);
	console.log(
		`Tarball ${packed.filename}: ${packed.entryCount} files, ${packed.size} bytes packed`,
	);
	for (const file of packed.files) {
		console.log(`  ${file.path}`);
	}

	const scanner = await import(pathToFileURL(scannerEntry).href);
	const legs = [
		['source (package.json, nodes/, credentials/)', root, scanner.SOURCE_FILE_PATTERNS],
		['tarball (compiled .js and package.json)', unpacked, ['**/*.js', 'package.json']],
	];
	for (const [label, directory, patterns] of legs) {
		const result = await scanner.analyzePackage(directory, patterns);
		if (result.passed) {
			console.log(`passed: ${label}`);
		} else {
			failed = true;
			console.log(`FAILED: ${label}: ${result.message}`);
			if (result.details) console.log(result.details);
		}
	}
} finally {
	rmSync(packDir, { recursive: true, force: true });
}

console.log(
	failed
		? 'The scan found problems. n8n would refuse the package as it is.'
		: "Both lint legs of n8n's scan pass. Provenance is added when GitHub Actions publishes.",
);
process.exit(failed ? 1 : 0);
