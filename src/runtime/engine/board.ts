// Boards: named, persisted architecture diagrams, one per file in an Obsidian
// vault (ADR 0004).
//
// A board is addressed by its identity — a name plus a variant — and that
// identity is also written into the note's frontmatter, so a file carries who
// it is independently of where it sits. The vault path is derived from the
// identity rather than stored:
//
//     payments                 -> <vault>/payments.excalidraw.md
//     payments@proposed        -> <vault>/payments@proposed.excalidraw.md
//     billing/ledger@option-a  -> <vault>/billing/ledger@option-a.excalidraw.md
//
// `current` is privileged (CONTEXT.md): it is the architecture that exists, so
// it gets the unadorned filename and every other variant hangs off it with an
// `@`. Variant is an open set, not a two-value enum — `option-a`, `option-b`
// and `option-c` alongside `current` is a real, expected shape.
//
// Level is board metadata rather than part of the address: two boards at
// different abstraction levels are different subjects, so they get different
// names.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ARCHBOARD_VAULT, noVaultMessage } from "./config.js";
import { type ExcalidrawFile, type ServerElement } from "./types.js";
import {
	readFrontmatterValue,
	isObsidianExcalidrawMd,
	extractSceneJsonFromObsidianMd,
	embeddedFilesIn,
	wrapSceneAsObsidianMd,
} from "./obsidian-md.js";

export interface BoardIdentity {
	// The name as a key: normalised, so it is the same string whoever typed it
	// and whichever filesystem the vault sits on (ADR 0010).
	board: string;
	variant: string;
	level?: string;
	// The casing a human actually used, carried only when it differs from the
	// key. It names the note and it is what a vault shows in its sidebar; it is
	// never what anything is looked up by.
	displayName?: string;
}

// The variant that means "the architecture that exists". Privileged: it owns
// the unadorned filename and is the default everywhere a variant is optional.
export const CURRENT_VARIANT = "current";

// The board the canvas holds before anything has been opened: somewhere to put
// things before there is a name for them. It has a note like every other board
// (ADR 0015) — the vault is where board content lives, and a board the process
// held and the vault did not would be the one exception that makes that a
// suggestion. What it does not have is a name anybody chose, which is what
// `board save --board scratch --as <name>` is for.
export const SCRATCH_BOARD = "scratch";

// Where archboard keeps its own state inside somebody's vault: the library
// (ADR 0007) and the scratch note. Alongside the boards, out of the way —
// Obsidian hides dot-directories, so the vault's note list stays notes, and
// `listBoards` skips them for the same reason. One directory rather than one
// per thing, so there is a single convention to learn and a single thing to
// leave alone.
export const VAULT_STATE_DIR = ".archboard";

export function isScratchKey(key: string): boolean {
	return normalizeBoardKey(key) === SCRATCH_BOARD;
}

// Board identity in the note's frontmatter, under the domain's own words.
// Flat and unprefixed because these are Obsidian *properties*: a human reads
// and edits them in the properties panel and queries them from Dataview, and
// `archboard-variant` would be our jargon leaking into their vault. Unlike
// customData — which the Excalidraw plugin writes into and where namespacing is
// forced (ADR 0003) — frontmatter is the note author's space, and these three
// keys are exactly what the note is about.
//
// Flat rather than nested for a second reason: the frontmatter block is
// round-tripped as raw lines to preserve everything else in it verbatim, and a
// top-level scalar is the only shape that can be updated in place without
// reformatting its neighbours.
export const FRONTMATTER_BOARD = "board";
export const FRONTMATTER_VARIANT = "variant";
export const FRONTMATTER_LEVEL = "level";

export const BOARD_FILE_SUFFIX = ".excalidraw.md";

// The abstraction tiers in use today. A controlled vocabulary that grows by
// being edited, so this is advisory rather than enforced — `promote --level`
// accepts anything slug-shaped and boards must not be stricter than the nodes
// on them.
export const LEVELS = ["system", "service", "module"] as const;

const SLUG_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
// `@` separates name from variant, so it can never appear in a name. The rest
// are characters that are hostile in a path or in an Obsidian wiki-link.
const NAME_SEGMENT_BAD_RE = /[@\\:*?"<>|[\]#^]/;
const hasControlCharacter = (value: string): boolean =>
	Array.from(value).some(
		(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
	);

// ─── Normalisation ────────────────────────────────────────────
//
// Board addresses are case-insensitive and unicode-normalised (ADR 0010).
// Boards are named out loud, and a human cannot pronounce casing, so
// `Payments` and `payments` have to be one board — on Linux, where the
// filesystem would happily keep two files, as much as on macOS, where it would
// not. NFC for the same reason one level down: macOS has historically written
// an accented name decomposed and Linux writes it composed, and the two spell
// the same word.
//
// Case-insensitive is not case-erasing. The casing a human typed names the
// note and shows in their vault; it is simply never what anything is looked up
// by. That is exactly how APFS and NTFS behave, so a vault looks the same on
// every platform archboard runs on.
export function normalizeBoardKey(key: string): string {
	return key.trim().normalize("NFC").toLowerCase();
}

/** The key form of a board name, `/` separators and all. */
export function normalizeBoardName(name: string): string {
	return normalizeBoardKey(name);
}

export function validateBoardName(name: string): string {
	const trimmed = name.trim().normalize("NFC");
	if (trimmed === "") throw new Error("Board name is required");
	if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
		throw new Error(`Invalid board name "${name}": it must not start or end with "/"`);
	}
	const segments = trimmed.split("/");
	for (const segment of segments) {
		if (segment === "" || segment === "." || segment === "..") {
			throw new Error(`Invalid board name "${name}": "${segment}" is not a usable path segment`);
		}
		if (segment !== segment.trim()) {
			throw new Error(
				`Invalid board name "${name}": path segments must not be padded with whitespace`,
			);
		}
		if (NAME_SEGMENT_BAD_RE.test(segment)) {
			throw new Error(
				`Invalid board name "${name}": "@ \\ : * ? " < > | [ ] # ^" are reserved ` +
					'("@" separates the variant; the rest break paths or Obsidian links)',
			);
		}
		if (hasControlCharacter(segment)) {
			throw new Error(`Invalid board name "${name}": control characters are not allowed`);
		}
	}
	return trimmed;
}

// A variant is a slug from a small vocabulary — `current`, `option-a` — not a
// title anybody reads, so unlike a board name it is lowercased outright and
// there is no casing to preserve.
export function validateVariant(variant: string): string {
	const trimmed = normalizeBoardKey(variant);
	if (trimmed === "") throw new Error("Variant is required");
	if (!SLUG_RE.test(trimmed)) {
		throw new Error(
			`Invalid variant "${variant}": use letters, digits, "-", "_" or "." (e.g. current, proposed, option-a)`,
		);
	}
	return trimmed;
}

export function validateLevel(level: string): string {
	const trimmed = level.trim();
	if (trimmed === "") throw new Error("Level is required");
	if (!SLUG_RE.test(trimmed)) {
		throw new Error(
			`Invalid level "${level}": use letters, digits, "-", "_" or "." ` +
				`(the vocabulary in use is ${LEVELS.join(", ")})`,
		);
	}
	return trimmed;
}

export function makeIdentity(input: {
	board: string;
	variant?: string;
	level?: string;
}): BoardIdentity {
	const typed = validateBoardName(input.board);
	const key = normalizeBoardName(typed);
	return {
		board: key,
		variant: validateVariant(input.variant ?? CURRENT_VARIANT),
		...(input.level !== undefined && input.level !== ""
			? { level: validateLevel(input.level) }
			: {}),
		...(typed === key ? {} : { displayName: typed }),
	};
}

/** What to call a board on screen and on disk: the casing a human chose. */
export function boardDisplayName(identity: Pick<BoardIdentity, "board" | "displayName">): string {
	return identity.displayName ?? identity.board;
}

// The address of a board: what a human says and what the store is keyed by.
export function boardKey(identity: Pick<BoardIdentity, "board" | "variant">): string {
	return identity.variant === CURRENT_VARIANT
		? identity.board
		: `${identity.board}@${identity.variant}`;
}

// Parse an address back into an identity. Accepts a bare name (the `current`
// variant) or `name@variant`.
export function parseBoardKey(key: string): BoardIdentity {
	const at = key.lastIndexOf("@");
	if (at === -1) return makeIdentity({ board: key });
	return makeIdentity({ board: key.slice(0, at), variant: key.slice(at + 1) });
}

// A canvas refuses to start without a vault (ADR 0015), so in a running server
// this cannot fire. It stays as the backstop for anything that reaches vault
// paths another way, and says the same thing the refusal says.
export function requireVaultRoot(): string {
	if (!ARCHBOARD_VAULT) throw new Error(noVaultMessage());
	return path.resolve(ARCHBOARD_VAULT);
}

// The entry in `dir` whose name is the same as `wanted` once normalised, or
// null. One readdir per path segment, which is what a case-insensitive
// filesystem does in the kernel and what archboard has to emulate on a
// case-sensitive one (ADR 0010). Sorted, so a vault that somehow holds two
// spellings of the same name resolves to the same one every time; `listBoards`
// reports that as a collision rather than leaving it to be discovered.
function entryMatching(dir: string, wanted: string): string | null {
	let entries: string[];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return null;
	}
	const key = normalizeBoardKey(wanted);
	return entries.filter((entry) => normalizeBoardKey(entry) === key).toSorted()[0] ?? null;
}

// Where a board lives. The identity is validated on the way in, so this cannot
// escape the vault; the containment check is kept anyway because a silent
// escape here writes a file into someone's home directory.
//
// A note that already exists wins, whatever casing it was written under: the
// address is case-insensitive, so `payments` has to find `Payments.excalidraw.md`.
// A note that does not exist yet is named with the casing the human typed,
// which is what makes the vault case-preserving as well as case-insensitive.
export function vaultPathFor(
	identity: Pick<BoardIdentity, "board" | "variant" | "displayName">,
	root = requireVaultRoot(),
): string {
	// Scratch is archboard's own note, not one somebody made, so it goes with
	// the rest of archboard's state and keeps the name this file gives it —
	// no display casing to preserve, and nothing on disk to match against.
	if (identity.board === SCRATCH_BOARD && identity.variant === CURRENT_VARIANT) {
		return path.join(path.resolve(root), VAULT_STATE_DIR, `${SCRATCH_BOARD}${BOARD_FILE_SUFFIX}`);
	}
	const name = validateBoardName(boardDisplayName(identity));
	const variant = validateVariant(identity.variant);
	const base = variant === CURRENT_VARIANT ? name : `${name}@${variant}`;
	const vault = path.resolve(root);
	const resolved = path.resolve(vault, `${base}${BOARD_FILE_SUFFIX}`);
	if (!resolved.startsWith(vault + path.sep)) {
		throw new Error(
			`Refusing to resolve board "${boardKey(identity)}" outside the vault at ${root}`,
		);
	}
	// Walk the vault a segment at a time, taking whatever spelling is on disk.
	// The moment a segment has no match the rest is a path that does not exist,
	// so the typed casing is the right name for it.
	//
	// No shortcut for a name that already matches byte for byte. It would be
	// faster and it would make the answer depend on how the caller spelled the
	// address, which is the one thing this must not do: a vault holding both
	// `payments` and `Payments` is broken, but it has to be broken the same way
	// for everybody until somebody renames one. `listBoards` reports it.
	const segments = `${base}${BOARD_FILE_SUFFIX}`.split("/");
	let at = vault;
	for (const [index, segment] of segments.entries()) {
		const found = entryMatching(at, segment);
		if (!found) return path.join(at, ...segments.slice(index));
		at = path.join(at, found);
	}
	return at;
}

// The identity a vault path implies, before frontmatter is consulted.
export function identityFromVaultPath(
	filePath: string,
	root = requireVaultRoot(),
): BoardIdentity | null {
	const relative = path.relative(path.resolve(root), path.resolve(filePath));
	if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
	if (!relative.endsWith(BOARD_FILE_SUFFIX)) return null;
	const base = relative.slice(0, -BOARD_FILE_SUFFIX.length).split(path.sep).join("/");
	try {
		return parseBoardKey(base);
	} catch {
		return null;
	}
}

// Frontmatter entries for an identity, in the order they are written.
//
// The name goes in with the casing a human chose, not the key. The frontmatter
// is a property a human reads and a Dataview query groups by, and the address
// is case-insensitive either way (ADR 0010), so there is nothing to gain by
// showing them the lowercased form of the name they typed.
export function identityFrontmatter(identity: BoardIdentity): Array<[string, string]> {
	const entries: Array<[string, string]> = [
		[FRONTMATTER_BOARD, boardDisplayName(identity)],
		[FRONTMATTER_VARIANT, identity.variant],
	];
	if (identity.level) entries.push([FRONTMATTER_LEVEL, identity.level]);
	return entries;
}

// The identity a note declares, or null when it declares none. Frontmatter is
// where identity lives, so this is what a loaded board reports; the path is
// only how the file was found.
export function identityFromFrontmatter(content: string): BoardIdentity | null {
	const board = readFrontmatterValue(content, FRONTMATTER_BOARD);
	if (!board) return null;
	try {
		return makeIdentity({
			board,
			variant: readFrontmatterValue(content, FRONTMATTER_VARIANT) ?? CURRENT_VARIANT,
			level: readFrontmatterValue(content, FRONTMATTER_LEVEL),
		});
	} catch {
		return null;
	}
}

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

// Every board has a note, so what tells naming from branching is which board
// was written FROM. Scratch is the placeholder: writing it somewhere else is
// the drawing getting a name. Any other board is a subject in its own right,
// and writing it somewhere else is a second board beside the first.
export function classifyBoardSave(sourceKey: string, targetKey: string): BoardSaveKind {
	if (targetKey === sourceKey) return "same-board";
	return isScratchKey(sourceKey) ? "named" : "branch";
}

/**
 * Whether the panes holding the source should move onto what was just written.
 *
 * Only when the board they were holding has stopped being worth looking at,
 * which is exactly the scratch case: the placeholder and its new name hold the
 * same drawing, and leaving a pane on `scratch` would show a copy of the board
 * that was just created.
 *
 * A branch does not move anything. You branch in order to compare, so taking
 * the source off screen at the moment the proposal is created is the opposite
 * of what was asked for. `board open` chooses what is on screen; a save writes
 * a file (ADR 0012).
 *
 * There is a second case this cannot see, and the save route adds it: saving a
 * board that has STOPPED SAVING somewhere else (ADR 0006, TASK-079). That is
 * spelt out where the panes are chosen in `src/server.ts`, because whether a
 * board is held is not something this function is told. Briefly: the two notes
 * hold one drawing, and the board left behind is about to go back to the
 * version another editor wrote, so a pane kept on it would show the human
 * their own work being replaced a second after they were told it was safe.
 */
export function panesFollowSave(kind: BoardSaveKind): boolean {
	return kind === "named";
}

// Render a board as an Obsidian note. `existingNote` is the current content of
// the destination when there is one: its frontmatter and everything else the
// vault put there is carried across verbatim, and only the identity keys are
// touched — and only when their value actually changed. That is what keeps two
// saves of an unchanged board byte-identical.
export function renderBoardNote(
	scene: Record<string, unknown>,
	existingNote: string | null | undefined,
	identity: BoardIdentity,
): string {
	return wrapSceneAsObsidianMd(scene, existingNote, { frontmatter: identityFrontmatter(identity) });
}

// Frontmatter lives at the top of the note; a board's scene JSON can be
// megabytes, and listing a vault must not read all of it.
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

function readHead(filePath: string, bytes = FRONTMATTER_PROBE_BYTES): string {
	const handle = fs.openSync(filePath, "r");
	try {
		const buffer = Buffer.alloc(bytes);
		const read = fs.readSync(handle, buffer, 0, bytes, 0);
		return buffer.subarray(0, read).toString("utf-8");
	} finally {
		fs.closeSync(handle);
	}
}

// The identity of a board file's *contents* — how archboard tells whether the
// note changed underneath it between reading it and writing it (ADR 0006).
//
// SHA-256 over the raw bytes, not over the parsed scene: a save rewrites the
// whole note — frontmatter, prose and scene alike — so the whole note is what
// has to be unchanged for that write to be safe. Bytes rather than the decoded
// string, so a note archboard cannot decode cleanly still compares honestly.
// Content rather than mtime, because a sync client will happily restamp a file
// it did not change, and an editor can change one within a clock tick.
export function hashBoardBytes(bytes: Buffer): string {
	return crypto.createHash("sha256").update(bytes).digest("hex");
}

// The live elements of a board note, from its raw bytes. Deleted elements are
// dropped, because a scene keeps its tombstones and nothing outside Excalidraw
// wants them.
//
// Deliberately not `readNoteFile` (src/core/board-io.ts), which is the one way
// a board is read. This is the vault scan behind `board list --repo`: it opens
// every note in the vault looking for bindings, which live on elements, and it
// never hashes, never writes and never draws. Reading a note the way a request
// reads one would make that scan load and base64 every picture the Obsidian
// plugin has moved into a vault file, for a scene whose `files` map it throws
// away.
export function extractSceneElements(note: string): ServerElement[] {
	if (!isObsidianExcalidrawMd(note)) {
		throw new Error("not an Obsidian .excalidraw.md note");
	}
	const scene = JSON.parse(extractSceneJsonFromObsidianMd(note));
	const record =
		scene && typeof scene === "object" && !Array.isArray(scene)
			? (scene as Record<string, unknown>)
			: {};
	const raw: unknown[] = Array.isArray(scene)
		? scene
		: Array.isArray(record.elements)
			? record.elements
			: [];
	return raw.filter((el) => {
		if (!el || typeof el !== "object") return false;
		return (el as Record<string, unknown>).isDeleted !== true;
	}) as ServerElement[];
}

// --- images the plugin moved into the vault --------------------------------
//
// A note the Obsidian Excalidraw plugin has saved carries no image bytes: it
// writes each one out as a real vault file and records where it went in the
// note's `## Embedded Files` section (see obsidian-md.ts, ADR 0017).
// Preserving that section keeps the record; following it is what keeps the
// picture, so a board the plugin has touched still renders here.
//
// Following it happens in `readNoteFile` (src/core/board-io.ts) and nowhere
// else, so every read of a board gets the pictures without knowing this
// section exists — and there is no second reader for a fix here to miss.

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".avif": "image/avif",
});

// Obsidian's wikilink target is a "linktext": the shortest form that still
// picks the file out — usually a bare filename, a vault-relative path when the
// name is ambiguous — optionally followed by `#heading` or `|alias`, which
// name a place inside a note and never a different file. The plugin's own
// PATHREG (`/(^[^#|]*)/`) cuts at exactly the same two characters.
function linkTarget(link: string): string {
	return link.split(/[#|]/)[0]!.trim();
}

// Every file in the vault, by lower-cased basename. Built only when a plain
// path lookup has already failed, which is the uncommon case: the plugin
// writes a bare filename when it is unique and a path when it is not.
function vaultFilesByName(root: string): Map<string, string[]> {
	const byName = new Map<string, string[]>();
	const walk = (dir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === ".git") continue;
				walk(full);
			} else if (entry.isFile()) {
				const name = entry.name.toLowerCase();
				const found = byName.get(name);
				if (found) found.push(full);
				else byName.set(name, [full]);
			}
		}
	};
	walk(root);
	return byName;
}

// The vault file a wikilink names, or null. Tried in the order Obsidian
// resolves them: vault-relative, then relative to the note, then by name.
// A name that matches more than one file is refused rather than guessed at —
// picking one would put a different picture on the board than the plugin
// showed.
function resolveVaultLink(
	link: string,
	notePath: string,
	root: string,
	byName: () => Map<string, string[]>,
): string | null {
	const target = linkTarget(link);
	if (target === "" || path.isAbsolute(target)) return null;
	const vault = path.resolve(root);
	const inside = (candidate: string): string | null => {
		const resolved = path.resolve(candidate);
		if (resolved !== vault && !resolved.startsWith(vault + path.sep)) return null;
		return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
	};
	const direct =
		inside(path.join(vault, target)) ?? inside(path.join(path.dirname(notePath), target));
	if (direct) return direct;
	const matches = byName().get(path.basename(target).toLowerCase()) ?? [];
	return matches.length === 1 ? matches[0]! : null;
}

// The images a note's `## Embedded Files` section points at, in the shape a
// scene's `files` map carries them. Anything that does not name a vault image
// — a hyperlink, an equation, a link whose file is gone — is left out: the
// record of it survives in the note either way, and inventing an entry for it
// would put a hole on the board where the plugin puts a picture it fetches.
export function resolveEmbeddedImages(
	note: string,
	notePath: string,
	root: string,
): Record<string, ExcalidrawFile> {
	const files: Record<string, ExcalidrawFile> = {};
	let names: Map<string, string[]> | null = null;
	const byName = () => (names ??= vaultFilesByName(path.resolve(root)));
	for (const entry of embeddedFilesIn(note)) {
		if (entry.kind !== "wikilink") continue;
		const mimeType = IMAGE_MIME_TYPES[path.extname(linkTarget(entry.target)).toLowerCase()];
		if (!mimeType) continue;
		const file = resolveVaultLink(entry.target, notePath, root, byName);
		if (!file) continue;
		let bytes: Buffer;
		try {
			bytes = fs.readFileSync(file);
		} catch {
			continue;
		}
		files[entry.fileId] = {
			id: entry.fileId,
			dataURL: `data:${mimeType};base64,${bytes.toString("base64")}`,
			mimeType,
			created: fs.statSync(file).mtimeMs,
		};
	}
	return files;
}

// A note's scene, with any image the plugin moved out of it put back. The
// scene JSON is only reassembled when the note has a section to read, so an
// ordinary note is not parsed and re-stringified for nothing.
export function sceneJsonWithEmbeddedImages(note: string, notePath: string, root: string): string {
	const sceneJson = extractSceneJsonFromObsidianMd(note);
	const resolved = resolveEmbeddedImages(note, notePath, root);
	if (Object.keys(resolved).length === 0) return sceneJson;
	const scene = JSON.parse(sceneJson);
	if (Array.isArray(scene)) return sceneJson;
	scene.files = { ...scene.files, ...resolved };
	return JSON.stringify(scene);
}

export interface VaultBoard {
	key: string;
	identity: BoardIdentity;
	file: string;
	// Set when the note's frontmatter names a different board than its path
	// does — a note that was renamed or moved in Obsidian since it was last
	// saved. The path is the address, so that is what `key` reports; the next
	// save rewrites the frontmatter and the disagreement goes away. Surfaced
	// rather than silently reconciled because it usually means a human moved
	// something and may not have meant to.
	declaredKey?: string;
	// The other notes in the vault that address the same board. Two notes whose
	// paths differ only in case, or only in unicode normalisation, are one
	// address (ADR 0010) and only one of them can be reached — but a
	// case-sensitive filesystem will hold both, so a vault authored on Linux
	// before this rule, or edited manually, can arrive in this state. Reported
	// rather than reconciled: which of two notes to keep is not archboard's to decide.
	collidesWith?: string[];
}

// Every board in the vault. Walks the whole tree because Obsidian vaults are
// organised in folders and a board name may contain "/" for exactly that
// reason. Dot-directories (.obsidian, .git, .trash) are skipped.
export function listBoards(root = requireVaultRoot()): VaultBoard[] {
	const vault = path.resolve(root);
	const found: VaultBoard[] = [];
	if (!fs.existsSync(vault)) return found;

	const walk = (dir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.isFile() || !entry.name.endsWith(BOARD_FILE_SUFFIX)) continue;
			const fromPath = identityFromVaultPath(full, vault);
			if (!fromPath) continue;
			let declared: BoardIdentity | null = null;
			try {
				declared = identityFromFrontmatter(readHead(full));
			} catch {
				/* unreadable head: the path still names the board */
			}
			// Level cannot be derived from a path, so it always comes from the note.
			const identity: BoardIdentity = {
				...fromPath,
				...(declared?.level ? { level: declared.level } : {}),
			};
			found.push({
				key: boardKey(identity),
				identity,
				file: full,
				...(declared && boardKey(declared) !== boardKey(fromPath)
					? { declaredKey: boardKey(declared) }
					: {}),
			});
		}
	};

	walk(vault);
	found.toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.file < b.file ? -1 : 1));

	// Notes that share a key. `vaultPathFor` picks one of them and the rest are
	// unreachable, which is a thing to be told rather than to find out.
	const byKey = new Map<string, VaultBoard[]>();
	for (const board of found) {
		const same = byKey.get(board.key);
		if (same) same.push(board);
		else byKey.set(board.key, [board]);
	}
	for (const same of byKey.values()) {
		if (same.length < 2) continue;
		for (const board of same) {
			board.collidesWith = same.filter((other) => other !== board).map((other) => other.file);
		}
	}
	return found;
}
