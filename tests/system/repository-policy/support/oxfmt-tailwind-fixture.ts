import { createHash } from "node:crypto";
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

export const CANONICAL_FORMAT_SCRIPTS = {
	fmt: "oxfmt . '!dist/**' '!node_modules/**' '!backlog/**'",
	"fmt:check": "oxfmt --check . '!dist/**' '!node_modules/**' '!backlog/**'",
} as const;

export const DEPENDENCY_PACKAGES = [
	"oxfmt",
	"tailwindcss",
	"tinypool",
	"@oxfmt/binding-linux-x64-gnu",
] as const;

export interface DependencyRecord {
	path: string;
	realpath: string;
	mode: number;
	size: number;
	sha256: string;
}

function walkFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	return [
		...new Bun.Glob("**/*").scanSync({ cwd: root, absolute: true, onlyFiles: true }),
	].toSorted();
}

function walkDirectories(root: string): string[] {
	if (!existsSync(root)) return [];
	const directories: string[] = [];
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		directories.push(directory);
		for (const entry of readdirSync(directory, { withFileTypes: true }))
			if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(join(directory, entry.name));
	}
	return directories;
}

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function record(root: string, path: string, file: string): DependencyRecord {
	const stat = statSync(file);
	return {
		path,
		realpath: realpathSync(file),
		mode: stat.mode & 0o777,
		size: stat.size,
		sha256: sha256(file),
	};
}

export function dependencySnapshot(fixtureRoot: string): DependencyRecord[] {
	const root = join(fixtureRoot, "node_modules");
	return walkFiles(root).map((file) => record(root, relative(root, file), file));
}

export function artifactSnapshot(fixtureRoot: string): DependencyRecord[] {
	const root = join(fixtureRoot, "dist");
	return walkFiles(root).map((file) => record(fixtureRoot, relative(fixtureRoot, file), file));
}

export function fileSnapshot(root: string, relativePaths: readonly string[]): DependencyRecord[] {
	return relativePaths.map((path) => record(root, path, join(root, path)));
}

function makeReadOnly(root: string): void {
	for (const file of walkFiles(root)) chmodSync(file, statSync(file).mode & 0o111 ? 0o555 : 0o444);
	for (const directory of walkDirectories(root).toSorted().toReversed())
		chmodSync(directory, 0o555);
}

function rejectSymlinks(root: string): void {
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (lstatSync(path).isSymbolicLink())
				throw new Error(`Dependency view contains symlink: ${path}`);
			if (entry.isDirectory()) pending.push(path);
		}
	}
}

export function copyReadOnlyDependencyView(repoRoot: string, fixtureRoot: string): void {
	const destination = join(fixtureRoot, "node_modules");
	mkdirSync(join(destination, ".bin"), { recursive: true });
	for (const packageName of DEPENDENCY_PACKAGES) {
		const source = join(repoRoot, "node_modules", packageName);
		const target = join(destination, packageName);
		if (!existsSync(source))
			throw new Error(`Missing installed dependency ${source}; run bun install.`);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(source, target, { recursive: true, dereference: true });
	}
	const executable = join(repoRoot, "node_modules/oxfmt/bin/oxfmt");
	if (!existsSync(executable))
		throw new Error(`Missing project-local Oxfmt executable ${executable}.`);
	const launcher = join(destination, ".bin/oxfmt");
	writeFileSync(launcher, '#!/usr/bin/env node\nimport "../oxfmt/bin/oxfmt";\n');
	chmodSync(launcher, 0o755);
	rejectSymlinks(destination);
	makeReadOnly(destination);
}

export function restoreAndRemoveScenarioRoot(root: string): void {
	try {
		for (const file of walkFiles(root))
			chmodSync(file, statSync(file).mode & 0o111 ? 0o755 : 0o644);
		for (const directory of walkDirectories(root).toSorted().toReversed())
			chmodSync(directory, 0o755);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (existsSync(root)) chmodSync(root, 0o755);
	rmSync(root, { recursive: true, force: true });
}

export function installLiveOxfmtEntrypoint(root: string, groupFile: string): void {
	const launcher = join(root, "node_modules/.bin/oxfmt");
	chmodSync(launcher, 0o755);
	writeFileSync(
		launcher,
		`#!/usr/bin/env bun
const child = Bun.spawn([process.execPath, "-e", ${JSON.stringify('process.on("SIGTERM", () => undefined); setInterval(() => undefined, 1000);')}], { detached: true, stdout: "ignore", stderr: "ignore" });
require("node:fs").writeFileSync(${JSON.stringify(groupFile)}, JSON.stringify({ group: child.pid }));
await new Promise(() => undefined);
`,
	);
	chmodSync(launcher, 0o555);
}
