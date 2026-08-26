import type { ServerElement } from "./types.js";

export interface LogicalAddress {
	repo?: string; // e.g. github.com/miklschmidt/archboard, or a repo dir name
	path: string; // relative to the repo root
	branch?: string;
	commit?: string;
	confirmedAt?: string;
}

export interface ArchboardBlock {
	node?: string;
	kind?: string;
	name?: string;
	binding?: LogicalAddress;
	variant?: string;
	level?: string;
	[key: string]: unknown;
}

export interface ElementMetadata {
	archboard?: ArchboardBlock;
	foreign: Record<string, unknown>;
}

// ADR 0003 makes the namespace the boundary. Top-level customData belongs to
// other tools even when a key happens to share one of archboard's names.
export function readElementMetadata(el: ServerElement): ElementMetadata {
	const custom = el.customData;
	if (!custom || typeof custom !== "object" || Array.isArray(custom)) {
		return { foreign: {} };
	}

	const values = custom as Record<string, unknown>;
	const candidate = values.archboard;
	const archboard =
		candidate && typeof candidate === "object" && !Array.isArray(candidate)
			? (candidate as ArchboardBlock)
			: undefined;
	const foreign: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values)) {
		if (key !== "archboard") foreign[key] = value;
	}
	return { ...(archboard ? { archboard } : {}), foreign };
}

export function archboardBlock(el: ServerElement): ArchboardBlock | undefined {
	return readElementMetadata(el).archboard;
}

export function nodeIdOf(el: ServerElement): string | undefined {
	const node = readElementMetadata(el).archboard?.node;
	return typeof node === "string" && node ? node : undefined;
}

export function nodeIdsOnBoard(elements: ServerElement[]): Set<string> {
	const ids = new Set<string>();
	for (const el of elements) {
		const id = nodeIdOf(el);
		if (id) ids.add(id);
	}
	return ids;
}
