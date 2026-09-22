// How a board is addressed: its identity, the key a human says, and the vault
// path derived from it (ADR 0004, ADR 0010). `board.ts` is the entrypoint; this
// is the address half of it.
//
//     payments                 -> <vault>/payments.semantic.json
//     payments@proposed        -> <vault>/payments@proposed.semantic.json
//     billing/ledger@option-a  -> <vault>/billing/ledger@option-a.semantic.json
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
 * Refuse a path segment that is not a name at all: empty, a directory
 * traversal, or padded with whitespace a file system would keep.
 * @param name The whole name, for the error message.
 * @param segment One `/`-separated segment of it.
 * @throws {Error} When the segment is one of those.
 */
function refuseUnusableSegment(name: string, segment: string): void {
	if (segment === "" || segment === "." || segment === "..") {
		throw new Error(`Invalid board name "${name}": "${segment}" is not a usable path segment`);
	}
	if (segment !== segment.trim()) {
		throw new Error(
			`Invalid board name "${name}": path segments must not be padded with whitespace`,
		);
	}
}

/**
 * Refuse a path segment holding a character that breaks a path, an Obsidian
 * link, or the address grammar itself.
 * @param name The whole name, for the error message.
 * @param segment One `/`-separated segment of it.
 * @throws {Error} When the segment holds one.
 */
function refuseReservedCharacters(name: string, segment: string): void {
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
 * Refuse one path segment of a board name that could not be a file name or
 * a wiki-link, naming the segment in the error so the human can fix it.
 * @param name The whole name, for the error message.
 * @param segment One `/`-separated segment of it.
 * @throws {Error} When the segment is not usable.
 */
function validateNameSegment(name: string, segment: string): void {
	refuseUnusableSegment(name, segment);
	refuseReservedCharacters(name, segment);
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
 * Check a variant is nameable, keeping what was typed.
 *
 * A variant selector is whatever the board answers to: `current`, a minted id,
 * or the lasting name a proposal was given — a title somebody wrote ("Proposed:
 * queued ingest"), not a slug. Casing, spaces and punctuation all survive: the
 * board matches them exactly (ADR 0023), and a name `branch` accepts has to be
 * addressable or it is a proposal nobody can open. So only `@` is refused, which
 * separates the variant from the board, with the control characters no address
 * may hold. What a FILENAME takes is asked in `variantInFileName` instead.
 * @param variant The variant as typed.
 * @returns The trimmed variant.
 */
function validateVariant(variant: string): string {
	const trimmed = variant.trim().normalize("NFC");
	if (trimmed === "") throw new Error("Variant is required");
	if (hasControlCharacter(trimmed)) {
		throw new Error(`Invalid variant "${variant}": control characters are not allowed`);
	}
	return trimmed;
}

/**
 * The variant as a board file's name spells it.
 *
 * A board file carries its variant after an `@` in its own name, so there it
 * has to be something a path can hold. Nothing else about an address asks it,
 * so the check lives at the one place a variant becomes part of a filename
 * rather than in the grammar every address goes through.
 * @param variant The variant as the identity holds it.
 * @returns The same variant, once it is safe to put in a name.
 * @throws {Error} When it cannot be part of a board file's name.
 */
function variantInFileName(variant: string): string {
	if (NAME_SEGMENT_BAD_RE.test(variant) || variant.includes("/")) {
		throw new Error(
			`A board file spells its variant into its filename, so "${variant}" cannot be one: ` +
				'"@ / \\ : * ? " < > | [ ] # ^" are reserved. Give the proposal a name a path can ' +
				"hold.",
		);
	}
	return variant;
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

/** A board as somebody typed it. */
interface IdentityInput {
	board: string;
	variant?: string;
	level?: string;
}

/**
 * Build a validated identity from what a caller typed, defaulting the variant
 * to `current` and keeping the typed casing only when it differs from the key.
 * @param input The name, and optionally a variant and level.
 * @returns The identity, ready to key a board by.
 */
function makeIdentity(input: IdentityInput): BoardIdentity {
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
 * Whether a variant is the `current` designation, however it was spelled.
 *
 * The designation is a word somebody says, and a word has no casing. Checked
 * rather than compared because the variant keeps what was typed: `@Current` and
 * `@current` are one address, and saying otherwise makes two boards of one.
 * @param variant The variant as the identity holds it.
 * @returns True when it names the current designation.
 */
function isCurrentVariant(variant: string): boolean {
	return normalizeBoardKey(variant) === CURRENT_VARIANT;
}

/**
 * The key form of a variant: what two spellings of one address agree on.
 *
 * The identity keeps the typed casing, because that is what a minted id and a
 * lasting name are matched by. A key is the other job — what a lock, a lease and
 * a catalogue entry are filed under — and there one address typed two ways has
 * to be one thing (ADR 0010).
 * @param variant The variant as the identity holds it.
 * @returns The variant as a key spells it.
 */
function variantKey(variant: string): string {
	return normalizeBoardKey(variant);
}

/**
 * The address of a board: what a human says and what the store is keyed by.
 * @param identity The board's identity.
 * @returns The bare name for the `current` variant, otherwise `name@variant`.
 */
function boardKey(identity: Pick<BoardIdentity, "board" | "variant">): string {
	return isCurrentVariant(identity.variant)
		? identity.board
		: `${identity.board}@${variantKey(identity.variant)}`;
}

/**
 * The address a pane shows a board under: the board, and the variant exactly as
 * the board answers to it.
 *
 * Not `boardKey`, which lowercases the variant because a lock, a lease and a
 * catalogue entry are filed under one spelling of an address (ADR 0010). A pane
 * address is the other job: it is resolved against the board's own variants, and
 * a minted id is matched by the mixed-case alphabet it was minted from
 * (ADR 0023), so lowercasing one stops it naming the variant it names.
 * @param identity The board's identity.
 * @returns The bare name for the `current` variant, otherwise `name@variant`.
 */
function paneBoardAddress(identity: Pick<BoardIdentity, "board" | "variant">): string {
	return isCurrentVariant(identity.variant)
		? identity.board
		: `${identity.board}@${identity.variant}`;
}

/**
 * Parse an address back into an identity. Accepts a bare name (the `current`
 * variant) or `name@variant`.
 *
 * Split at the FIRST `@`, and that is what makes every name a branch accepts
 * addressable. A board's own name can never hold one — `@` is reserved in a
 * name segment — so everything after the first is the variant, whatever it
 * contains: a proposal called "Queue @ edge" is a title somebody wrote, and a
 * name that could be given and then not opened would be a trap.
 * @param key The address as typed.
 * @returns The validated identity.
 */
function parseBoardKey(key: string): BoardIdentity {
	const at = key.indexOf("@");
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
 * A board's note name, without the suffix: the board's own name, and the
 * variant after an `@` when it is not the current one.
 * @param identity The board.
 * @returns The base name.
 * @throws {Error} When the name or variant is not usable.
 */
function noteBaseName(identity: Pick<BoardIdentity, "board" | "variant" | "displayName">): string {
	const name = validateBoardName(boardDisplayName(identity));
	const variant = validateVariant(identity.variant);
	return isCurrentVariant(variant) ? name : `${name}@${variantInFileName(variant)}`;
}

/**
 * The path with each existing segment spelled as the filesystem has it.
 *
 * The moment a segment has no match the rest is a path that does not exist,
 * so the typed casing is the right name for it.
 * @param vault The resolved vault root.
 * @param relative The note path relative to the vault, as typed.
 * @returns The path.
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
 * Whether an existing candidate has exactly the spelling the caller supplied.
 * `existsSync` alone cannot answer this on a case-insensitive filesystem: APFS
 * reports that `payments` exists when the directory entry is `Payments`.
 *
 * Real paths are used only to compare the path relative to the vault. The
 * returned board path stays lexical, so a symlink is neither followed into the
 * result nor allowed to bypass the containment check below.
 * @param vault The resolved vault root.
 * @param candidate The resolved candidate inside the vault.
 * @param relative The candidate path relative to the vault, as typed.
 * @returns True when the candidate exists under that exact relative spelling.
 */
function byteEqualPathExists(vault: string, candidate: string, relative: string): boolean {
	if (!fs.existsSync(candidate)) return false;
	try {
		const actualRelative = path.relative(
			fs.realpathSync.native(vault),
			fs.realpathSync.native(candidate),
		);
		return actualRelative === relative.split("/").join(path.sep);
	} catch {
		return false;
	}
}

/**
 * Scratch is archboard's own note, not one somebody made, so it goes with the
 * rest of archboard's state and keeps the name this file gives it — no display
 * casing to preserve, and nothing on disk to match against.
 * @param identity The board being located.
 * @param root The vault root.
 * @param suffix The file suffix the board kind is stored under.
 * @returns The path, or null when the board is not archboard's own.
 */
function archboardOwnPath(
	identity: Pick<BoardIdentity, "board" | "variant">,
	root: string,
	suffix: string,
): string | null {
	if (identity.board !== SCRATCH_BOARD || !isCurrentVariant(identity.variant)) {
		return null;
	}
	return path.join(path.resolve(root), VAULT_STATE_DIR, `${SCRATCH_BOARD}${suffix}`);
}

/**
 * Where a board lives. The identity is validated on the way in, so this cannot
 * escape the vault; the containment check is kept anyway because a silent
 * escape here writes a file into someone's home directory.
 *
 * A file that already exists wins, whatever casing it was written under: the
 * address is case-insensitive, so `payments` has to find
 * `Payments.semantic.json`. A file that does not exist yet is named with the
 * casing the human typed, which is what makes the vault case-preserving as well
 * as case-insensitive. The suffix is a parameter rather than a constant here
 * because which file kind a board is stored in belongs to whoever stores it
 * (ADR 0023); addressing is what every board shares.
 * @param identity The board to locate.
 * @param root The vault root.
 * @param suffix The file suffix the board kind is stored under.
 * @returns The absolute file path.
 */
function vaultPathFor(
	identity: Pick<BoardIdentity, "board" | "variant" | "displayName">,
	root: string,
	suffix: string,
): string {
	const own = archboardOwnPath(identity, root, suffix);
	if (own !== null) {
		return own;
	}
	const base = noteBaseName(identity);
	const vault = path.resolve(root);
	const relative = `${base}${suffix}`;
	const resolved = path.resolve(vault, relative);
	if (!resolved.startsWith(vault + path.sep)) {
		throw new Error(
			`Refusing to resolve board "${boardKey(identity)}" outside the vault at ${root}`,
		);
	}
	// A file at the byte-equal path is the answer, without a readdir. The only
	// vault where this and the case-insensitive walk below disagree is one that
	// already holds two case-variants of the same name, which ADR 0010 calls
	// broken and `listBoards` already reports as a collision (TASK-153).
	if (byteEqualPathExists(vault, resolved, relative)) return resolved;
	return caseInsensitivePath(vault, relative);
}

export {
	type BoardIdentity,
	CURRENT_VARIANT,
	isCurrentVariant,
	variantKey,
	SCRATCH_BOARD,
	VAULT_STATE_DIR,
	LEVELS,
	normalizeBoardKey,
	normalizeBoardName,
	validateBoardName,
	validateVariant,
	validateLevel,
	makeIdentity,
	boardDisplayName,
	boardKey,
	paneBoardAddress,
	parseBoardKey,
	isScratchKey,
	requireVaultRoot,
	vaultPathFor,
};
