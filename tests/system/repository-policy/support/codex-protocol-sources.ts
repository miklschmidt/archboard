import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface SourceFile {
	readonly path: string;
	readonly source?: string;
	readonly tracked?: boolean;
	readonly symlink?: boolean;
}

export function normalizeRepositoryPath(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function readProtocolFixture(repoRoot: string, filePath: string): string {
	return fs.readFileSync(
		path.join(repoRoot, "tests/system/repository-policy/fixtures/codex-protocol", filePath),
		"utf8",
	);
}

function isSourceFilePath(filePath: string): boolean {
	return /\.(?:[cm]?[jt]sx?)$/u.test(filePath);
}

function isSourceEntryPath(filePath: string): boolean {
	return isSourceFilePath(filePath) || /^(?:src|scripts|tests|tools)(?:\/|$)/u.test(filePath);
}

export function trackedRepositoryPaths(root: string): Set<string> {
	return new Set(
		execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
			.split("\0")
			.filter(Boolean)
			.map(normalizeRepositoryPath),
	);
}

export function sourceEntries(root: string, tracked: ReadonlySet<string>): SourceFile[] {
	const paths = new Set<string>();
	for (const file of tracked) if (isSourceEntryPath(file)) paths.add(file);
	for (const pattern of ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"])
		for (const file of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
			if (/(?:^|\/)(?:\.git|backlog|dist|node_modules)(?:\/|$)/u.test(file)) continue;
			paths.add(normalizeRepositoryPath(file));
		}
	return [...paths].toSorted().flatMap<SourceFile>((file) => {
		const absolute = path.join(root, file);
		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(absolute);
		} catch {
			return [];
		}
		if (stat.isSymbolicLink())
			return isSourceEntryPath(file)
				? [{ path: file, tracked: tracked.has(file), symlink: true }]
				: [];
		return stat.isFile() && isSourceFilePath(file)
			? [{ path: file, source: fs.readFileSync(absolute, "utf8"), tracked: tracked.has(file) }]
			: [];
	});
}
