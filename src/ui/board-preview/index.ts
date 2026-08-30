import type {
	ExcalidrawElement,
	NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { BoardPreviewSnapshot } from "../types";
import { cleanElementForExcalidraw, elementsForScene } from "../canvas/elements";

export type PreviewTheme = "light" | "dark";

export interface MountedBoardPreviewScene {
	board: string;
	elements: readonly ExcalidrawElement[];
	files: BinaryFiles;
}

export interface MountedBoardPreviewController {
	read(): MountedBoardPreviewScene | null;
}

export interface PreviewScene {
	elements: readonly NonDeletedExcalidrawElement[];
	files: BinaryFiles;
}

export interface PreviewCacheIdentity {
	board: string;
	fingerprint: string;
	theme: PreviewTheme;
}

interface PreviewCacheEntry extends PreviewCacheIdentity {
	url: string;
}

const cacheKey = ({ board, fingerprint, theme }: PreviewCacheIdentity): string =>
	JSON.stringify([board, fingerprint, theme]);

/** A small LRU of owned Blob URLs. Every removal revokes its URL. */
export class BoardPreviewCache {
	readonly #entries = new Map<string, PreviewCacheEntry>();

	constructor(
		readonly limit = 8,
		readonly revoke = (url: string): void => URL.revokeObjectURL(url),
	) {
		if (!Number.isSafeInteger(limit) || limit < 1)
			throw new Error("Preview cache limit must be positive.");
	}

	get size(): number {
		return this.#entries.size;
	}

	get(identity: PreviewCacheIdentity): string | null {
		const key = cacheKey(identity);
		const entry = this.#entries.get(key);
		if (!entry) return null;
		this.#entries.delete(key);
		this.#entries.set(key, entry);
		return entry.url;
	}

	put(identity: PreviewCacheIdentity, url: string): void {
		const key = cacheKey(identity);
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
		const replaced = this.#entries.get(key);
		if (replaced) {
			this.#entries.delete(key);
			if (replaced.url !== url) this.revoke(replaced.url);
		}
		this.#entries.set(key, { ...identity, url });
		while (this.#entries.size > this.limit) {
			const oldest = this.#entries.entries().next().value as
				| [string, PreviewCacheEntry]
				| undefined;
			if (!oldest) break;
			this.#entries.delete(oldest[0]);
			this.revoke(oldest[1].url);
		}
	}

	clear(): void {
		for (const entry of this.#entries.values()) this.revoke(entry.url);
		this.#entries.clear();
	}
}

export interface PreviewRequestToken {
	readonly board: string;
	readonly generation: number;
}

/** Makes late exports inert even when their dependency ignores AbortSignal. */
export class PreviewRequestGate {
	#generation = 0;
	#current: PreviewRequestToken | null = null;

	begin(board: string): PreviewRequestToken {
		this.#current = { board, generation: ++this.#generation };
		return this.#current;
	}

	accepts(token: PreviewRequestToken): boolean {
		return this.#current?.board === token.board && this.#current.generation === token.generation;
	}

	cancel(): void {
		this.#generation += 1;
		this.#current = null;
	}
}

export function projectPreviewSnapshot(snapshot: BoardPreviewSnapshot): PreviewScene {
	const elements = elementsForScene(snapshot.elements.map(cleanElementForExcalidraw)).filter(
		(element) => !element.isDeleted,
	) as NonDeletedExcalidrawElement[];
	return { elements, files: snapshot.files as BinaryFiles };
}

const orderedFiles = (files: BinaryFiles): readonly unknown[] =>
	Object.keys(files)
		.toSorted()
		.map((id) => [id, files[id]]);

/** A strong content identity for an imperative pane scene. */
export async function fingerprintMountedPreview(scene: MountedBoardPreviewScene): Promise<string> {
	const bytes = new TextEncoder().encode(
		`archboard-mounted-preview-v1\n${JSON.stringify([scene.elements, orderedFiles(scene.files)])}`,
	);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
