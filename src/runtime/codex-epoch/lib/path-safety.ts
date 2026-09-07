import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { CodexEpochError } from "@/runtime/codex-epoch/lib/contract";
import type { CodexEpochFileSystem } from "@/runtime/codex-epoch/lib/storage";

/** One step of a path walk: the canonical prefix so far, and whether it has left the disk. */
interface WalkState {
	readonly canonical: string;
	readonly missingParent: boolean;
}

/**
 * Refuse an epoch root that is the same as, inside, or a parent of either Codex storage root,
 * so epoch state can never be written where Codex owns the bytes.
 * @param fileSystem - The file-system seam.
 * @param epochRoot - The directory the epoch store writes to.
 * @param codexRoots - The Codex storage roots it must stay clear of.
 */
function assertSafeStorageRoots(
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

/**
 * Resolve one path segment against the canonical prefix, refusing a symbolic link. A segment
 * that does not exist yet is appended verbatim, and every segment after it too: nothing below
 * a missing directory can be a link.
 * @param fileSystem - The file-system seam.
 * @param current - The absolute path of this segment.
 * @param segment - The segment's own name.
 * @param state - The walk so far.
 * @param label - What is being resolved, for messages.
 * @returns The walk after this segment.
 */
function walkSegment(
	fileSystem: CodexEpochFileSystem,
	current: string,
	segment: string,
	state: WalkState,
	label: string,
): WalkState {
	if (state.missingParent) {
		return { canonical: join(state.canonical, segment), missingParent: true };
	}
	try {
		const stats = fileSystem.lstatSync(current);
		if (stats.isSymbolicLink()) {
			throw new CodexEpochError(
				"outside_codex_storage",
				`${label} contains a symbolic-link component`,
			);
		}
		return { canonical: realpath(fileSystem, current, label), missingParent: false };
	} catch (error) {
		if (error instanceof CodexEpochError) {
			throw error;
		}
		if (!isMissing(error)) {
			throw new CodexEpochError("storage_failure", `${label} cannot be inspected`, error);
		}
		return { canonical: join(state.canonical, segment), missingParent: true };
	}
}

/**
 * The canonical form of an absolute path, proved to contain no symbolic-link component. A
 * path that does not exist yet is still canonicalised as far as it does exist.
 * @param fileSystem - The file-system seam.
 * @param value - The path to canonicalise.
 * @param label - What the path is, for messages.
 * @returns The canonical absolute path.
 */
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
	let state: WalkState = {
		canonical: realpath(fileSystem, root, label),
		missingParent: false,
	};
	for (const segment of relative(root, normalized).split(sep).filter(Boolean)) {
		current = join(current, segment);
		state = walkSegment(fileSystem, current, segment, state, label);
	}
	return resolve(state.canonical);
}

/**
 * Resolve a path through the file system, reporting a failure as a storage failure.
 * @param fileSystem - The file-system seam.
 * @param path - The path to resolve.
 * @param label - What the path is, for messages.
 * @returns The resolved path.
 */
function realpath(fileSystem: CodexEpochFileSystem, path: string, label: string): string {
	try {
		return fileSystem.realpathSync(path);
	} catch (error) {
		throw new CodexEpochError("storage_failure", `${label} cannot be resolved`, error);
	}
}

/**
 * Whether two canonical paths are the same or one contains the other.
 * @param left - One path.
 * @param right - The other.
 * @returns True when they are not disjoint.
 */
function isPathRelated(left: string, right: string): boolean {
	return isWithin(left, right) || isWithin(right, left);
}

/**
 * Whether one canonical path is the same as, or below, another.
 * @param child - The candidate descendant.
 * @param parent - The candidate ancestor.
 * @returns True when the child is at or under the parent.
 */
function isWithin(child: string, parent: string): boolean {
	const path = relative(parent, child);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * Whether a caught file-system error says the path does not exist.
 * @param error - The caught value.
 * @returns True for ENOENT.
 */
function isMissing(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export { assertSafeStorageRoots };
