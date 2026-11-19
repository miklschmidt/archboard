// How a board is addressed: its identity and the key a human says (ADR 0004,
// ADR 0010).
//
//     payments                 -> the current variant of payments
//     payments@proposed        -> its variant "proposed"
//     billing/ledger@option-a  -> the variant "option-a" of billing/ledger
//
// `current` is privileged (CONTEXT.md): it is the architecture that exists, so
// its key is the bare name and every other variant hangs off it with an `@`.
// Variant is an open set, not a two-value enum — `option-a`, `option-b` and
// `option-c` alongside `current` is a real, expected shape.
//
// Level is board metadata rather than part of the address: two boards at
// different abstraction levels are different subjects, so they get different
// names.

interface LegacyIdentity {
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
// the bare key and is the default everywhere a variant is optional.
const CURRENT_VARIANT = "current";

// The abstraction tiers of the default vocabulary, named when a refusal needs to
// say which levels exist.
const LEVELS = ["system", "service", "module"] as const;

const SLUG_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
// `@` separates name from variant, so it can never appear in a name. The rest
// are characters that are hostile in a path or in a link to a note.
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
function normalizePaneKey(key: string): string {
	return key.trim().normalize("NFC").toLowerCase();
}

/**
 * The key form of a board name, `/` separators and all.
 * @param name A board name as typed.
 * @returns The normalised name.
 */
function normalizeBoardName(name: string): string {
	return normalizePaneKey(name);
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
 * Refuse a path segment holding a character that breaks a path, a link, or the
 * address grammar itself.
 * @param name The whole name, for the error message.
 * @param segment One `/`-separated segment of it.
 * @throws {Error} When the segment holds one.
 */
function refuseReservedCharacters(name: string, segment: string): void {
	if (NAME_SEGMENT_BAD_RE.test(segment)) {
		throw new Error(
			`Invalid board name "${name}": "@ \\ : * ? " < > | [ ] # ^" are reserved ` +
				'("@" separates the variant; the rest are kept out of file names and links)',
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
 * board matches them exactly, and a name `branch` accepts has to be
 * addressable or it is a proposal nobody can open. So only `@` is refused, which
 * separates the variant from the board, with the control characters no address
 * may hold.
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
function makeIdentity(input: IdentityInput): LegacyIdentity {
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
 * Whether a variant is the `current` designation, however it was spelled.
 *
 * The designation is a word somebody says, and a word has no casing. Checked
 * rather than compared because the variant keeps what was typed: `@Current` and
 * `@current` are one address, and saying otherwise makes two boards of one.
 * @param variant The variant as the identity holds it.
 * @returns True when it names the current designation.
 */
function isCurrentVariant(variant: string): boolean {
	return normalizePaneKey(variant) === CURRENT_VARIANT;
}

/**
 * The variant a semantic board address states, or undefined when it names none.
 *
 * `makeIdentity` materialises a bare key as `current`, and `board@current` is
 * spelled as the same key by `paneKey` and `paneAddressKey`, so at the pane
 * layer neither states a variant: both open whatever the board's bare name
 * opens, which is its current variant, or its draft on a board nobody has built
 * (`addressedVariant`, ADR 0031). A reader asking which variant is implemented
 * reads the board's designation instead, never this.
 * @param identity The address, as parsed.
 * @returns The variant it names, or undefined for the board's bare name.
 */
function statedVariant(identity: Pick<LegacyIdentity, "variant">): string | undefined {
	return isCurrentVariant(identity.variant) ? undefined : identity.variant;
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
	return normalizePaneKey(variant);
}

/**
 * The address of a board: what a human says and what the store is keyed by.
 * @param identity The board's identity.
 * @returns The bare name for the `current` variant, otherwise `name@variant`.
 */
function paneKey(identity: Pick<LegacyIdentity, "board" | "variant">): string {
	return isCurrentVariant(identity.variant)
		? identity.board
		: `${identity.board}@${variantKey(identity.variant)}`;
}

/**
 * The address a pane shows a board under: the board, and the variant exactly as
 * the board answers to it.
 *
 * Not `paneKey`, which lowercases the variant because a lock, a lease and a
 * catalogue entry are filed under one spelling of an address (ADR 0010). A pane
 * address is the other job: it is resolved against the board's own variants, and
 * a minted id is matched by the mixed-case alphabet it was minted from,
 * so lowercasing one stops it naming the variant it names.
 * @param identity The board's identity.
 * @returns The bare name for the `current` variant, otherwise `name@variant`.
 */
function paneAddressKey(identity: Pick<LegacyIdentity, "board" | "variant">): string {
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
function parsePaneKey(key: string): LegacyIdentity {
	const at = key.indexOf("@");
	if (at === -1) return makeIdentity({ board: key });
	return makeIdentity({ board: key.slice(0, at), variant: key.slice(at + 1) });
}

export {
	type LegacyIdentity,
	isCurrentVariant,
	makeIdentity,
	normalizePaneKey,
	paneAddressKey,
	paneKey,
	parsePaneKey,
	statedVariant,
};
