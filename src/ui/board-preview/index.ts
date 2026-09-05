import type {
	ExcalidrawElement,
	NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { BoardPreviewSnapshot } from "@/ui/types";
import {
	cleanElementForExcalidraw,
	elementsForScene,
	isNonDeletedElement,
} from "@/ui/canvas/elements";

type PreviewTheme = "light" | "dark";

interface MountedBoardPreviewScene {
	board: string;
	elements: readonly ExcalidrawElement[];
	files: BinaryFiles;
}

interface MountedBoardPreviewController {
	read(): MountedBoardPreviewScene | null;
}

interface PreviewScene {
	elements: readonly NonDeletedExcalidrawElement[];
	files: BinaryFiles;
}

interface PreviewCacheIdentity {
	board: string;
	fingerprint: string;
	theme: PreviewTheme;
}

interface PreviewCacheEntry extends PreviewCacheIdentity {
	url: string;
}

/**
 * One map key per board, content fingerprint and theme.
 * @param identity What the cached preview depicts.
 * @returns A stable string key.
 */
const cacheKey = (identity: PreviewCacheIdentity): string =>
	JSON.stringify([identity.board, identity.fingerprint, identity.theme]);

/** A small LRU of owned Blob URLs. Every removal revokes its URL. */
class BoardPreviewCache {
	readonly #entries = new Map<string, PreviewCacheEntry>();

	/**
	 * Create a cache that revokes what it drops.
	 * @param limit How many previews to keep before evicting the least recently used.
	 * @param revoke How to release a dropped Blob URL.
	 */
	constructor(
		readonly limit = 8,
		readonly revoke = (url: string): void => URL.revokeObjectURL(url),
	) {
		if (!Number.isSafeInteger(limit) || limit < 1) {
			throw new Error("Preview cache limit must be positive.");
		}
	}

	/**
	 * How many previews are held.
	 * @returns The entry count.
	 */
	get size(): number {
		return this.#entries.size;
	}

	/**
	 * Read a preview and mark it most recently used.
	 * @param identity What the preview depicts.
	 * @returns Its Blob URL, or null when not cached.
	 */
	get(identity: PreviewCacheIdentity): string | null {
		const key = cacheKey(identity);
		const entry = this.#entries.get(key);
		if (!entry) {
			return null;
		}
		this.#entries.delete(key);
		this.#entries.set(key, entry);
		return entry.url;
	}

	/**
	 * Store a preview, dropping the same board's other prints in this theme.
	 * @param identity What the preview depicts.
	 * @param url The owned Blob URL.
	 */
	put(identity: PreviewCacheIdentity, url: string): void {
		const key = cacheKey(identity);
		this.#dropSiblings(identity, key);
		const replaced = this.#entries.get(key);
		if (replaced) {
			this.#entries.delete(key);
			if (replaced.url !== url) {
				this.revoke(replaced.url);
			}
		}
		this.#entries.set(key, { ...identity, url });
		while (this.#entries.size > this.limit) {
			this.#dropOldest();
		}
	}

	/**
	 * Drop every other fingerprint cached for this board and theme.
	 * @param identity The preview being stored.
	 * @param key Its cache key, which survives.
	 */
	#dropSiblings(identity: PreviewCacheIdentity, key: string): void {
		for (const [candidateKey, entry] of this.#entries) {
			if (
				entry.board === identity.board &&
				entry.theme === identity.theme &&
				candidateKey !== key
			) {
				this.#entries.delete(candidateKey);
				this.revoke(entry.url);
			}
		}
	}

	/** Drop the least recently used preview. */
	#dropOldest(): void {
		const oldest = this.#entries.entries().next();
		if (!oldest.done) {
			this.#entries.delete(oldest.value[0]);
			this.revoke(oldest.value[1].url);
		}
	}

	/** Revoke and forget every preview. */
	clear(): void {
		for (const entry of this.#entries.values()) {
			this.revoke(entry.url);
		}
		this.#entries.clear();
	}
}

interface PreviewRequestToken {
	readonly board: string;
	readonly generation: number;
}

/** Makes late exports inert even when their dependency ignores AbortSignal. */
class PreviewRequestGate {
	#generation = 0;
	#current: PreviewRequestToken | null = null;

	/**
	 * Start a new request, superseding any earlier one.
	 * @param board The board being previewed.
	 * @returns The token a completion must present.
	 */
	begin(board: string): PreviewRequestToken {
		this.#current = { board, generation: ++this.#generation };
		return this.#current;
	}

	/**
	 * Whether a completion is still the current request.
	 * @param token The token issued by `begin`.
	 * @returns True only for the latest, uncancelled request.
	 */
	accepts(token: PreviewRequestToken): boolean {
		return this.#current?.board === token.board && this.#current.generation === token.generation;
	}

	/** Reject every outstanding completion. */
	cancel(): void {
		this.#generation += 1;
		this.#current = null;
	}
}

/**
 * Turn a server preview snapshot into the scene Excalidraw's exporter accepts.
 * @param snapshot The canonical scene the server sent for previewing.
 * @returns Live elements without server bookkeeping, plus the scene's files.
 */
function projectPreviewSnapshot(snapshot: BoardPreviewSnapshot): PreviewScene {
	const elements = elementsForScene(snapshot.elements.map(cleanElementForExcalidraw)).filter(
		isNonDeletedElement,
	);
	return { elements, files: snapshot.files };
}

/**
 * Files in a key order that does not depend on insertion history.
 * @param files The scene's binary files.
 * @returns Sorted `[id, file]` pairs.
 */
const orderedFiles = (files: BinaryFiles): readonly unknown[] =>
	Object.keys(files)
		.toSorted()
		.map((id) => [id, files[id]]);

/**
 * A strong content identity for an imperative pane scene.
 * @param scene What a mounted pane currently holds.
 * @returns A hex SHA-256 over the elements and files, ignoring the board name.
 */
async function fingerprintMountedPreview(scene: MountedBoardPreviewScene): Promise<string> {
	const bytes = new TextEncoder().encode(
		`archboard-mounted-preview-v1\n${JSON.stringify([scene.elements, orderedFiles(scene.files)])}`,
	);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export {
	type PreviewTheme,
	type MountedBoardPreviewScene,
	type MountedBoardPreviewController,
	type PreviewScene,
	type PreviewCacheIdentity,
	BoardPreviewCache,
	type PreviewRequestToken,
	PreviewRequestGate,
	projectPreviewSnapshot,
	fingerprintMountedPreview,
};
