// How a board is addressed: its identity, the key a human says, the frontmatter
// that carries the identity inside a note, and the vault path derived from it
// (ADR 0004, ADR 0010). `board.ts` is the entrypoint; this is the address half
// of it.
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

import fs from "fs";
import path from "path";
import { ARCHBOARD_VAULT, noVaultMessage } from "@/runtime/engine/config";
import { readFrontmatterValue } from "@/runtime/engine/obsidian-md";

interface BoardIdentity {
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
const CURRENT_VARIANT = "current";

// The board the canvas holds before anything has been opened: somewhere to put
// things before there is a name for them. It has a note like every other board
// (ADR 0015) — the vault is where board content lives, and a board the process
// held and the vault did not would be the one exception that makes that a
// suggestion. What it does not have is a name anybody chose, which is what
// `board save --board scratch --as <name>` is for.
const SCRATCH_BOARD = "scratch";

// Where archboard keeps its own state inside somebody's vault: the library
// (ADR 0007) and the scratch note. Alongside the boards, out of the way —
// Obsidian hides dot-directories, so the vault's note list stays notes, and
// `listBoards` skips them for the same reason. One directory rather than one
// per thing, so there is a single convention to learn and a single thing to
// leave alone.
const VAULT_STATE_DIR = ".archboard";

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
const FRONTMATTER_BOARD = "board";
const FRONTMATTER_VARIANT = "variant";
const FRONTMATTER_LEVEL = "level";

const BOARD_FILE_SUFFIX = ".excalidraw.md";

// The abstraction tiers in use today. A controlled vocabulary that grows by
// being edited, so this is advisory rather than enforced — `promote --level`
// accepts anything slug-shaped and boards must not be stricter than the nodes
// on them.
const LEVELS = ["system", "service", "module"] as const;

const SLUG_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
// `@` separates name from variant, so it can never appear in a name. The rest
// are characters that are hostile in a path or in an Obsidian wiki-link.
const NAME_SEGMENT_BAD_RE = /[@\\:*?"<>|[\]#^]/;

/**
 * Whether a name segment holds a control character, which no path or link
 * can carry safely.
 * @param value One path segment of a board name.
 * @returns True when any character is a C0 control or DEL.
 */
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

/**
 * The lookup form of a board address: trimmed, NFC-normalised and lowercased,
 * so every spelling a human might type names the same board.
 * @param key A board key or name as typed.
 * @returns The normalised key.
 */
function normalizeBoardKey(key: string): string {
	return key.trim().normalize("NFC").toLowerCase();
}

/**
 * The key form of a board name, `/` separators and all.
 * @param name A board name as typed.
 * @returns The normalised name.
 */
function normalizeBoardName(name: string): string {
	return normalizeBoardKey(name);
}

/**
 * Refuse one path segment of a board name that could not be a file name or
 * a wiki-link, naming the segment in the error so the human can fix it.
 * @param name The whole name, for the error message.
 * @param segment One `/`-separated segment of it.
 */
function validateNameSegment(name: string, segment: string): void {
	if (segment === "" || segment === "." || segment === "..") {
		throw new Error(`Invalid board name "${name}": "${segment}" is not a usable path segment`);
	}
	if (segment !== segment.trim()) {
		throw new Error(`Invalid board name "${name}": path segments must not be padded with whitespace`);
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

/**
 * Check a board name is usable as a vault path and a wiki-link, keeping the
 * casing the human typed.
 * @param name The name as typed.
 * @returns The trimmed, NFC-normalised name with its casing intact.
 */
function validateBoardName(name: string): string {
	const trimmed = name.trim().normalize("NFC");
	if (trimmed === "") throw new Error("Board name is required");
	if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
		throw new Error(`Invalid board name "${name}": it must not start or end with "/"`);
	}
	for (const segment of trimmed.split("/")) {
		validateNameSegment(name, segment);
	}
	return trimmed;
}

/**
 * Check a variant is a slug. A variant is a word from a small vocabulary —
 * `current`, `option-a` — not a title anybody reads, so unlike a board name it
 * is lowercased outright and there is no casing to preserve.
 * @param variant The variant as typed.
 * @returns The normalised slug.
 */
function validateVariant(variant: string): string {
	const trimmed = normalizeBoardKey(variant);
	if (trimmed === "") throw new Error("Variant is required");
	if (!SLUG_RE.test(trimmed)) {
		throw new Error(
			`Invalid variant "${variant}": use letters, digits, "-", "_" or "." (e.g. current, proposed, option-a)`,
		);
	}
	return trimmed;
}

/**
 * Check an abstraction level is slug-shaped. The vocabulary is advisory, so
 * anything slug-shaped passes and the error only lists what is in use.
 * @param level The level as typed.
 * @returns The trimmed level.
 */
function validateLevel(level: string): string {
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

/**
 * Build a validated identity from what a caller typed, defaulting the variant
 * to `current` and keeping the typed casing only when it differs from the key.
 * @param input The name, and optionally a variant and level.
 * @returns The identity, ready to key a board by.
 */
function makeIdentity(input: { board: string; variant?: string; level?: string }): BoardIdentity {
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

/**
 * What to call a board on screen and on disk: the casing a human chose.
 * @param identity The board's identity.
 * @returns The display name, or the key when no other casing was chosen.
 */
function boardDisplayName(identity: Pick<BoardIdentity, "board" | "displayName">): string {
	return identity.displayName ?? identity.board;
}

/**
 * The address of a board: what a human says and what the store is keyed by.
 * @param identity The board's identity.
 * @returns The bare name for the `current` variant, otherwise `name@variant`.
 */
function boardKey(identity: Pick<BoardIdentity, "board" | "variant">): string {
	return identity.variant === CURRENT_VARIANT
		? identity.board
		: `${identity.board}@${identity.variant}`;
}

/**
 * Parse an address back into an identity. Accepts a bare name (the `current`
 * variant) or `name@variant`.
 * @param key The address as typed.
 * @returns The validated identity.
 */
function parseBoardKey(key: string): BoardIdentity {
	const at = key.lastIndexOf("@");
	if (at === -1) return makeIdentity({ board: key });
	return makeIdentity({ board: key.slice(0, at), variant: key.slice(at + 1) });
}

/**
 * Whether an address names the scratch board, whichever way it was spelled.
 * @param key A board key as typed.
 * @returns True for the scratch board.
 */
function isScratchKey(key: string): boolean {
	return normalizeBoardKey(key) === SCRATCH_BOARD;
}

/**
 * The vault root, or the same refusal a canvas gives when it has none. A
 * canvas refuses to start without a vault (ADR 0015), so in a running server
 * this cannot fire; it stays as the backstop for anything that reaches vault
 * paths another way.
 * @returns The absolute vault path.
 */
function requireVaultRoot(): string {
	if (!ARCHBOARD_VAULT) throw new Error(noVaultMessage());
	return path.resolve(ARCHBOARD_VAULT);
}

/**
 * The entry in `dir` whose name is the same as `wanted` once normalised, or
 * null. One readdir per path segment, which is what a case-insensitive
 * filesystem does in the kernel and what archboard has to emulate on a
 * case-sensitive one (ADR 0010). Sorted, so a vault that somehow holds two
 * spellings of the same name resolves to the same one every time; `listBoards`
 * reports that as a collision rather than leaving it to be discovered.
 * @param dir The directory to look in.
 * @param wanted The segment as typed.
 * @returns The on-disk spelling, or null when nothing matches or the directory is unreadable.
 */
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

/**
 * Walk the vault a segment at a time, taking whatever spelling is on disk.
 * The moment a segment has no match the rest is a path that does not exist,
 * so the typed casing is the right name for it.
 * @param vault The resolved vault root.
 * @param relative The note path relative to the vault, as typed.
 * @returns The path with each existing segment spelled as the filesystem has it.
 */
function caseInsensitivePath(vault: string, relative: string): string {
	const segments = relative.split("/");
	let at = vault;
	for (const [index, segment] of segments.entries()) {
		const found = entryMatching(at, segment);
		if (!found) return path.join(at, ...segments.slice(index));
		at = path.join(at, found);
	}
	return at;
}

/**
 * Where a board lives. The identity is validated on the way in, so this cannot
 * escape the vault; the containment check is kept anyway because a silent
 * escape here writes a file into someone's home directory.
 *
 * A note that already exists wins, whatever casing it was written under: the
 * address is case-insensitive, so `payments` has to find `Payments.excalidraw.md`.
 * A note that does not exist yet is named with the casing the human typed,
 * which is what makes the vault case-preserving as well as case-insensitive.
 * @param identity The board to locate.
 * @param root The vault root.
 * @returns The absolute note path.
 */
function vaultPathFor(
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
	// A note at the byte-equal path is the answer, without a readdir. The only
	// vault where this and the case-insensitive walk below disagree is one that
	// already holds two case-variants of the same name, which ADR 0010 calls
	// broken and `listBoards` already reports as a collision (TASK-153).
	if (fs.existsSync(resolved)) return resolved;
	return caseInsensitivePath(vault, `${base}${BOARD_FILE_SUFFIX}`);
}

/**
 * The identity a vault path implies, before frontmatter is consulted.
 * @param filePath A path inside the vault.
 * @param root The vault root.
 * @returns The identity, or null when the path is outside the vault, not a note, or not a valid address.
 */
function identityFromVaultPath(filePath: string, root = requireVaultRoot()): BoardIdentity | null {
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

/**
 * Frontmatter entries for an identity, in the order they are written.
 *
 * The name goes in with the casing a human chose, not the key. The frontmatter
 * is a property a human reads and a Dataview query groups by, and the address
 * is case-insensitive either way (ADR 0010), so there is nothing to gain by
 * showing them the lowercased form of the name they typed.
 * @param identity The board's identity.
 * @returns Key and value pairs, level last and only when set.
 */
function identityFrontmatter(identity: BoardIdentity): Array<[string, string]> {
	const entries: Array<[string, string]> = [
		[FRONTMATTER_BOARD, boardDisplayName(identity)],
		[FRONTMATTER_VARIANT, identity.variant],
	];
	if (identity.level) entries.push([FRONTMATTER_LEVEL, identity.level]);
	return entries;
}

/**
 * The identity a note declares, or null when it declares none. Frontmatter is
 * where identity lives, so this is what a loaded board reports; the path is
 * only how the file was found.
 * @param content The note's text, or at least its head.
 * @returns The declared identity, or null when absent or invalid.
 */
function identityFromFrontmatter(content: string): BoardIdentity | null {
	const board = readFrontmatterValue(content, FRONTMATTER_BOARD);
	if (!board) return null;
	try {
		const level = readFrontmatterValue(content, FRONTMATTER_LEVEL);
		return makeIdentity({
			board,
			variant: readFrontmatterValue(content, FRONTMATTER_VARIANT) ?? CURRENT_VARIANT,
			...(level === undefined ? {} : { level }),
		});
	} catch {
		return null;
	}
}

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
};
