// Pictures this browser has drawn, kept across page loads (TASK-247).
//
// A picture is a reading of one version of a board, under one vault policy,
// drawn by one build of the renderer. Any of the three moving makes it a
// picture of something that is no longer there, so each is stamped with all
// three and a lookup misses unless all three still hold. That keeps the board
// file the one source of truth (ADR 0023): what is kept here is a cache of what
// the server's board looked like, and it is never shown without being checked
// against what the server says now.
//
// The browser's storage can be missing, full or refuse outright (a private
// window, cleared site data), so every read and write here survives that and
// simply draws again.

import { z } from "zod";

import { SemanticRenderReplySchema, type SemanticRenderReply } from "@/shared/semantic-board/index";
import type { SemanticRenderRequest } from "@/ui/semantic-board-canvas/api/semantic-boards";

/** What a cached picture has to agree with to be shown. */
interface PictureStamp {
	/** The board's version. */
	readonly version: number;
	/** The vault policy's fingerprint. */
	readonly fingerprint: string;
	/** Which build of the renderer drew it. */
	readonly renderer: string;
}

/** The storage a cache lives in: `localStorage`, or a stand-in. */
type PictureStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "archboard.picture:";

const CachedPictureSchema = z.object({
	version: z.int(),
	fingerprint: z.string(),
	renderer: z.string(),
	/** When it was kept, so a full store gives up its oldest pictures first. */
	storedAt: z.number(),
	reply: SemanticRenderReplySchema,
});
type CachedPicture = z.infer<typeof CachedPictureSchema>;

/**
 * The storage key one render request is kept under.
 * @param request The board, variant, view and theme asked for.
 * @returns The key.
 */
function pictureKey(request: SemanticRenderRequest): string {
	return `${PREFIX}${JSON.stringify([request.board, request.variant ?? "", request.view ?? "", request.theme, request.comparison === false ? "plain" : "compared"])}`;
}

/**
 * One kept entry, or nothing when it is absent, unreadable or not a picture.
 * @param storage The storage.
 * @param key Its key.
 * @returns The entry.
 */
function readEntry(storage: PictureStorage, key: string): CachedPicture | undefined {
	try {
		const raw = storage.getItem(key);
		if (raw === null) return undefined;
		const parsed = CachedPictureSchema.safeParse(JSON.parse(raw));
		if (parsed.success) return parsed.data;
	} catch {
		// Unreadable storage or a mangled entry: treated as absent below.
	}
	forget(storage, key);
	return undefined;
}

/**
 * Remove one entry, ignoring storage that refuses.
 * @param storage The storage.
 * @param key Its key.
 */
function forget(storage: PictureStorage, key: string): void {
	try {
		storage.removeItem(key);
	} catch {
		// Nothing more to do: the entry will fail its stamp next time anyway.
	}
}

/**
 * Every key this cache owns.
 * @param storage The storage.
 * @returns The keys.
 */
function pictureKeys(storage: PictureStorage): string[] {
	const keys: string[] = [];
	try {
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (key?.startsWith(PREFIX) === true) keys.push(key);
		}
	} catch {
		return [];
	}
	return keys;
}

/**
 * The kept picture for a request, when it still agrees with its stamp.
 * @param storage The storage.
 * @param request What is being asked for.
 * @param current What the board, policy and renderer are now.
 * @returns The picture, or nothing when there is none or it is out of date.
 */
function readCachedPicture(
	storage: PictureStorage,
	request: SemanticRenderRequest,
	current: PictureStamp,
): SemanticRenderReply | undefined {
	const key = pictureKey(request);
	const entry = readEntry(storage, key);
	if (entry === undefined) return undefined;
	if (
		entry.version !== current.version ||
		entry.fingerprint !== current.fingerprint ||
		entry.renderer !== current.renderer
	) {
		forget(storage, key);
		return undefined;
	}
	return entry.reply;
}

/**
 * Keep a picture. A full store gives up its oldest half and tries once more;
 * a store that still refuses is left alone, and the picture is drawn next time.
 * @param storage The storage.
 * @param request What was asked for.
 * @param stamp What the board, policy and renderer were when it was drawn.
 * @param reply The picture.
 * @param now The time it is kept at.
 */
function writeCachedPicture(
	storage: PictureStorage,
	request: SemanticRenderRequest,
	stamp: PictureStamp,
	reply: SemanticRenderReply,
	now: number = Date.now(),
): void {
	const key = pictureKey(request);
	const entry: CachedPicture = { ...stamp, storedAt: now, reply };
	const raw = JSON.stringify(entry);
	try {
		storage.setItem(key, raw);
		return;
	} catch {
		evictOldestHalf(storage);
	}
	try {
		storage.setItem(key, raw);
	} catch {
		// Still full: this picture is simply not kept.
	}
}

/**
 * Give up the older half of the kept pictures.
 * @param storage The storage.
 */
function evictOldestHalf(storage: PictureStorage): void {
	const aged = pictureKeys(storage)
		.map((key) => ({ key, storedAt: readEntry(storage, key)?.storedAt ?? 0 }))
		.toSorted((one, other) => one.storedAt - other.storedAt);
	for (const { key } of aged.slice(0, Math.ceil(aged.length / 2))) forget(storage, key);
}

/**
 * On page load, before any kept picture is shown: forget every picture of a
 * board that is gone or has moved to another version, and every picture an
 * older renderer drew.
 * @param storage The storage.
 * @param boards The boards the server lists, with their versions.
 * @param renderer Which build of the renderer this page runs.
 */
function forgetStalePictures(
	storage: PictureStorage,
	boards: readonly { readonly name: string; readonly version?: number | undefined }[],
	renderer: string,
): void {
	const versions = new Map(boards.map((board) => [board.name, board.version]));
	for (const key of pictureKeys(storage)) {
		const entry = readEntry(storage, key);
		if (entry === undefined) continue;
		if (entry.renderer !== renderer || versions.get(entry.reply.board) !== entry.version) {
			forget(storage, key);
		}
	}
}

export {
	forgetStalePictures,
	readCachedPicture,
	writeCachedPicture,
	type PictureStamp,
	type PictureStorage,
};
