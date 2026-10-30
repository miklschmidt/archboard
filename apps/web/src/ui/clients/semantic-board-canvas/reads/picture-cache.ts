// Pictures this browser has drawn, kept across page loads (TASK-247).
//
// A picture is a reading of one version of a board, under one vault policy,
// drawn by one build of the renderer. Any of the three moving makes it a
// picture of something that is no longer there, so each is kept under a key
// that names all three and a lookup misses unless all three still hold. That
// keeps the board file the one source of truth (ADR 0023): what is kept here is
// a cache of what the server's board looked like, and it is never shown without
// being checked against what the server says now.
//
// Pictures are kept in IndexedDB (TASK-344). localStorage held about 5 MB for
// the whole page, less than the whole boards and their views, so a store that
// overflowed dropped pictures the page had just drawn ahead. A picture takes its
// theme from the page's CSS (TASK-346), so a reading is kept once, not once per
// theme.
// A key carries its stamp, so forgetting stale pictures reads keys and never a
// picture.
//
// The browser's storage can be missing, full or refuse outright (a private
// window, cleared site data), so every read and write here survives that and
// simply draws again.

import { createStore, del, get, keys, set } from "idb-keyval";
import { z } from "zod";
import { ArchitectureRenderResultSchema } from "@archboard/board/model";
import type { prepareContentHere } from "@archboard/renderer/browser";

import {
	DEFAULT_LAYOUT_ENGINE,
	SemanticRenderReplySchema,
	type SemanticRenderReply,
} from "@archboard/board/render-reply";
import {
	comparisonKey,
	type SemanticRenderRequest,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";

/** What a cached picture has to agree with to be shown. */
interface PictureStamp {
	/** The board's version. */
	readonly version: number;
	/** The vault policy's fingerprint. */
	readonly fingerprint: string;
	/** Which build of the renderer drew it. */
	readonly renderer: string;
}

/** Where pictures are kept: this browser's IndexedDB, or a stand-in. */
interface PictureStorage {
	readonly get: (key: string) => Promise<unknown>;
	readonly set: (key: string, value: unknown) => Promise<void>;
	readonly del: (key: string) => Promise<void>;
	readonly keys: () => Promise<readonly IDBValidKey[]>;
}

type ModelDrawing = Awaited<ReturnType<ReturnType<typeof prepareContentHere>["draw"]>>;
const ModelDrawingSchema = ArchitectureRenderResultSchema.options[0]
	.pick({ svg: true, width: true, height: true, atlas: true, placed: true })
	.extend({
		readingDirection: z
			.literal("down" satisfies NonNullable<ModelDrawing["readingDirection"]>)
			.optional(),
	});

/**
 * Reuse a local scene only when its complete render input and renderer build match.
 * @param storage The existing picture store, when available.
 * @param key The renderer build and exact prepared scene identity.
 * @param draw The local layout operation on a cache miss.
 * @returns The stored scene or a fresh scene when storage is unavailable.
 */
async function cachedModelDrawing(
	storage: PictureStorage | undefined,
	key: string,
	draw: () => Promise<ModelDrawing>,
): Promise<ModelDrawing> {
	if (storage === undefined) return draw();
	try {
		const cached = ModelDrawingSchema.safeParse(await storage.get(key));
		if (cached.success) return cached.data;
	} catch {
		// Refused storage leaves local rendering available.
	}
	const drawing = await draw();
	try {
		await storage.set(key, drawing);
	} catch {
		// A full or closed store does not prevent the scene from appearing.
	}
	return drawing;
}

/**
 * This browser's picture store, or nothing when the page has no IndexedDB.
 * @returns The storage.
 */
function browserPictureStorage(): PictureStorage | undefined {
	if (typeof indexedDB === "undefined") return undefined;
	const store = createStore("archboard-pictures", "pictures");
	return {
		/**
		 * One kept picture.
		 * @param key Its key.
		 * @returns The picture, or nothing.
		 */
		get: (key) => get(key, store),
		/**
		 * Keep a picture.
		 * @param key Its key.
		 * @param value The picture.
		 * @returns When it is kept.
		 */
		set: (key, value) => set(key, value, store),
		/**
		 * Forget a picture.
		 * @param key Its key.
		 * @returns When it is gone.
		 */
		del: (key) => del(key, store),
		/**
		 * Every kept picture's key.
		 * @returns The keys.
		 */
		keys: () => keys(store),
	};
}

/** How many fields a key of this module has: a key of any other length is of an older page. */
const KEY_FIELDS = 9;

/**
 * The key one render request is kept under, stamped. A picture is of a board of
 * one vault: two repositories can each have a board of the same name.
 * @param request The vault, board, variant and view asked for.
 * @param stamp The version, policy and renderer it was drawn from.
 * @returns The key.
 */
function pictureKey(request: SemanticRenderRequest, stamp: PictureStamp): string {
	return JSON.stringify([
		request.vault,
		request.board,
		request.variant ?? "",
		request.view ?? "",
		comparisonKey(request),
		request.layout ?? DEFAULT_LAYOUT_ENGINE,
		stamp.version,
		stamp.fingerprint,
		stamp.renderer,
	]);
}

/**
 * The picture kept for a request, when it was drawn from what the server says now.
 * @param storage The storage.
 * @param request What is asked for.
 * @param current The board version, policy and renderer build in force now.
 * @returns The kept picture, or nothing.
 */
async function readCachedPicture(
	storage: PictureStorage,
	request: SemanticRenderRequest,
	current: PictureStamp,
): Promise<SemanticRenderReply | undefined> {
	try {
		const parsed = SemanticRenderReplySchema.safeParse(
			await storage.get(pictureKey(request, current)),
		);
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Keep a freshly drawn picture. A store that refuses it keeps nothing.
 * @param storage The storage.
 * @param request What was asked for.
 * @param stamp What it was drawn from.
 * @param reply The picture.
 */
async function writeCachedPicture(
	storage: PictureStorage,
	request: SemanticRenderRequest,
	stamp: PictureStamp,
	reply: SemanticRenderReply,
): Promise<void> {
	try {
		await storage.set(pictureKey(request, stamp), reply);
	} catch {
		// Full or refused: this picture is simply not kept.
	}
}

/**
 * Forget every picture of a board of one vault that moved or went away, or that
 * another build of the renderer drew, reading only the keys. A picture of
 * another vault is that vault's listing's to judge, and a key an older page
 * wrote is forgotten, because nothing asks for it again.
 * @param storage The storage.
 * @param vault The vault the boards are in.
 * @param boards The boards the server lists there, with their versions.
 * @param renderer The renderer build in force now.
 */
async function forgetStalePictures(
	storage: PictureStorage,
	vault: string,
	boards: readonly {
		readonly name: string;
		readonly key: string;
		readonly version?: number | undefined;
	}[],
	renderer: string,
): Promise<void> {
	try {
		const stale = (await storage.keys()).filter((key): key is string => {
			if (typeof key !== "string") return false;
			const parts = keyParts(key);
			if (parts.length !== KEY_FIELDS) return true;
			const [ofVault, board, , , , , version, , drawnBy] = parts;
			if (ofVault !== vault) return false;
			const listed = boards.find(
				({ name, key: listedKey }) =>
					typeof board === "string" &&
					(sameBoardName(board, listedKey) || sameBoardName(board, name)),
			);
			return drawnBy !== renderer || listed === undefined || listed.version !== version;
		});
		await Promise.all(stale.map((key) => storage.del(key)));
	} catch {
		// Unreadable storage: a stale picture still fails its stamp on lookup.
	}
}

/**
 * The fields of a kept key, or none for a key this module did not write.
 * @param key A stored key.
 * @returns Vault, board, variant, view, comparison, engine, version, fingerprint, renderer.
 */
function keyParts(key: string): unknown[] {
	try {
		const parts: unknown = JSON.parse(key);
		return Array.isArray(parts) ? parts : [];
	} catch {
		return [];
	}
}

export {
	browserPictureStorage,
	cachedModelDrawing,
	forgetStalePictures,
	readCachedPicture,
	writeCachedPicture,
	type PictureStamp,
	type PictureStorage,
};
