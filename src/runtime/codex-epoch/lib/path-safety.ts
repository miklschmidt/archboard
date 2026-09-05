import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { CodexEpochError } from "./contract.js";
import type { CodexEpochFileSystem } from "./storage.js";

export function assertSafeStorageRoots(
	fileSystem: CodexEpochFileSystem,
	epochRoot: string,
	...codexRoots: readonly string[]
): void {
	const canonicalEpoch = canonicalPathWithoutSymlinks(fileSystem, epochRoot, "epoch root");
	for (const codexRoot of codexRoots) {
		const canonicalCodex = canonicalPathWithoutSymlinks(fileSystem, codexRoot, "Codex root");
		if (isPathRelated(canonicalEpoch, canonicalCodex)) {
			throw new CodexEpochError(
				"outside_codex_storage",
				"epoch state must be outside both Codex storage roots",
			);
		}
	}
}

function canonicalPathWithoutSymlinks(
	fileSystem: CodexEpochFileSystem,
	value: string,
	label: string,
): string {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw new CodexEpochError("invalid_input", `${label} must be an absolute path`);
	}
	const normalized = resolve(value);
	const root = parse(normalized).root;
	let current = root;
	let canonical = realpath(fileSystem, root, label);
	let missingParent = false;
	for (const segment of relative(root, normalized).split(sep).filter(Boolean)) {
		current = join(current, segment);
		if (missingParent) {
			canonical = join(canonical, segment);
			continue;
		}
		try {
			const stats = fileSystem.lstatSync(current);
			if (stats.isSymbolicLink()) {
				throw new CodexEpochError(
					"outside_codex_storage",
					`${label} contains a symbolic-link component`,
				);
			}
			canonical = realpath(fileSystem, current, label);
		} catch (error) {
			if (error instanceof CodexEpochError) {
				throw error;
			}
			if (!isMissing(error)) {
				throw new CodexEpochError("storage_failure", `${label} cannot be inspected`, error);
			}
			missingParent = true;
			canonical = join(canonical, segment);
		}
	}
	return resolve(canonical);
}

function realpath(fileSystem: CodexEpochFileSystem, path: string, label: string): string {
	try {
		return fileSystem.realpathSync(path);
	} catch (error) {
		throw new CodexEpochError("storage_failure", `${label} cannot be resolved`, error);
	}
}

function isPathRelated(left: string, right: string): boolean {
	return isWithin(left, right) || isWithin(right, left);
}

function isWithin(child: string, parent: string): boolean {
	const path = relative(parent, child);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isMissing(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
