// Boards: named, persisted architecture diagrams, one per file in an Obsidian
// vault (ADR 0004).
//
// A board is addressed by its identity — a name plus a variant — and that
// identity is also written into the note's frontmatter, so a file carries who
// it is independently of where it sits. The vault path is derived from the
// identity rather than stored (lib/board-address.ts). Listing the vault is
// lib/board-vault-listing.ts, and following the pictures the Obsidian plugin
// moved out of a note is lib/board-embedded-images.ts. What stays here is what
// a note holds once found: how it is rendered, hashed and scanned.

import crypto from "crypto";
import { type ServerElement } from "@/runtime/engine/types";
import {
	isObsidianExcalidrawMd,
	extractSceneJsonFromObsidianMd,
	wrapSceneAsObsidianMd,
} from "@/runtime/engine/obsidian-md";
import {
	type BoardIdentity,
	identityFrontmatter,
	isScratchKey,
} from "@/runtime/engine/lib/board-address";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

export {
	type BoardIdentity,
	CURRENT_VARIANT,
	SCRATCH_BOARD,
	VAULT_STATE_DIR,
	FRONTMATTER_BOARD,
	FRONTMATTER_VARIANT,
	FRONTMATTER_LEVEL,
	BOARD_FILE_SUFFIX,
	LEVELS,
	normalizeBoardKey,
	normalizeBoardName,
	validateBoardName,
	validateVariant,
	validateLevel,
	makeIdentity,
	boardDisplayName,
	boardKey,
	parseBoardKey,
	isScratchKey,
	requireVaultRoot,
	vaultPathFor,
	identityFromVaultPath,
	identityFrontmatter,
	identityFromFrontmatter,
} from "@/runtime/engine/lib/board-address";
export { type VaultBoard, listBoards } from "@/runtime/engine/lib/board-vault-listing";
export {
	resolveEmbeddedImages,
	sceneJsonWithEmbeddedImages,
} from "@/runtime/engine/lib/board-embedded-images";

// ─── What a save did to the address, and who follows it ───────
//
// `board save` writes to one of three places, and they are three different
// acts even though one command spells all of them (ADR 0012).

export type BoardSaveKind =
	// The board saved itself back to its own note. Nothing about the address
	// changed and there is nothing to say about panes.
	| "same-board"
	// The scratch board got a name. Scratch is a placeholder, not a subject, so
	// the drawing a pane is holding has just become a board somebody meant.
	| "named"
	// A board with a home was written to a second address as well. The source
	// keeps its note, its baseline and its place in the store: nothing was
	// renamed and nothing moved.
	| "branch";

/**
 * Which of the three acts a save was. Every board has a note, so what tells
 * naming from branching is which board was written FROM. Scratch is the
 * placeholder: writing it somewhere else is the drawing getting a name. Any
 * other board is a subject in its own right, and writing it somewhere else is
 * a second board beside the first.
 * @param sourceKey The board the save was issued for.
 * @param targetKey The note it was written to.
 * @returns The kind of save.
 */
export function classifyBoardSave(sourceKey: string, targetKey: string): BoardSaveKind {
	if (targetKey === sourceKey) return "same-board";
	return isScratchKey(sourceKey) ? "named" : "branch";
}

/**
 * Render a board as an Obsidian note. `existingNote` is the current content of
 * the destination when there is one: its frontmatter and everything else the
 * vault put there is carried across verbatim, and only the identity keys are
 * touched — and only when their value actually changed. That is what keeps two
 * saves of an unchanged board byte-identical.
 * @param scene The Excalidraw scene to embed.
 * @param existingNote The destination's current text, when it exists.
 * @param identity The board the note is for.
 * @returns The note's text.
 */
export function renderBoardNote(
	scene: Record<string, unknown>,
	existingNote: string | null | undefined,
	identity: BoardIdentity,
): string {
	return wrapSceneAsObsidianMd(scene, existingNote, { frontmatter: identityFrontmatter(identity) });
}

/**
 * The identity of a board file's *contents* — how archboard tells whether the
 * note changed underneath it between reading it and writing it (ADR 0006).
 *
 * SHA-256 over the raw bytes, not over the parsed scene: a save rewrites the
 * whole note — frontmatter, prose and scene alike — so the whole note is what
 * has to be unchanged for that write to be safe. Bytes rather than the decoded
 * string, so a note archboard cannot decode cleanly still compares honestly.
 * Content rather than mtime, because a sync client will happily restamp a file
 * it did not change, and an editor can change one within a clock tick.
 * @param bytes The note's bytes as read or as about to be written.
 * @returns The hex digest.
 */
export function hashBoardBytes(bytes: Buffer): string {
	return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Whether a raw scene entry is a live element record the vault scan can
 * read bindings from. The scan deliberately does not validate elements the
 * way a board read does (see `extractSceneElements`), so this checks only what
 * it relies on: an object with a string `id` and `type` that is not a tombstone.
 * @param value One entry of a scene's `elements`.
 * @returns True for a live element-shaped record.
 */
function isLiveElementRecord(value: unknown): value is ServerElement {
	return (
		isRecord(value) &&
		typeof value["id"] === "string" &&
		typeof value["type"] === "string" &&
		value["isDeleted"] !== true
	);
}

/**
 * The live elements of a board note, from its raw bytes. Deleted elements are
 * dropped, because a scene keeps its tombstones and nothing outside Excalidraw
 * wants them.
 *
 * Deliberately not `readNoteFile` (src/runtime/engine/board-io.ts), which is the one way
 * a board is read. This is the vault scan behind `board list --repo`: it opens
 * every note in the vault looking for bindings, which live on elements, and it
 * never hashes, never writes and never draws. Reading a note the way a request
 * reads one would make that scan load and base64 every picture the Obsidian
 * plugin has moved into a vault file, for a scene whose `files` map it throws
 * away.
 * @param note The note's text.
 * @returns The live elements, unvalidated beyond their shape.
 */
export function extractSceneElements(note: string): ServerElement[] {
	if (!isObsidianExcalidrawMd(note)) {
		throw new Error("not an Obsidian .excalidraw.md note");
	}
	const scene: unknown = JSON.parse(extractSceneJsonFromObsidianMd(note));
	const raw: unknown[] = Array.isArray(scene)
		? scene
		: isRecord(scene) && Array.isArray(scene["elements"])
			? scene["elements"]
			: [];
	return raw.filter(isLiveElementRecord);
}
