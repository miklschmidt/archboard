// The frontmatter of an Obsidian Excalidraw note.
//
// A board's identity (board / variant / level) lives in the note's
// frontmatter, and a vault note may carry any number of other keys — aliases,
// cssclasses, whatever the human or another plugin put there. Export must not
// be the thing that deletes them, so when the destination file already exists
// its frontmatter body is carried across *verbatim*: the raw lines are
// round-tripped rather than parsed into a map and re-emitted, which keeps key
// order, comments, quoting and block scalars exactly as the user wrote them
// and avoids taking on a YAML dependency for a format we only need to read
// well enough to spot key names.

// Emitted when the destination has no frontmatter of its own. The blank lines
// are the Obsidian Excalidraw plugin's own shape, kept so a fresh export is
// byte-identical to what the plugin itself would write.
const DEFAULT_FRONTMATTER_LINES = ["", "excalidraw-plugin: parsed", "tags: [excalidraw]", ""];

// Keys the Obsidian Excalidraw plugin needs to open the note as a drawing.
// Only added when absent — an existing value is the user's to control.
const REQUIRED_FRONTMATTER: ReadonlyArray<[key: string, line: string]> = [
	["excalidraw-plugin", "excalidraw-plugin: parsed"],
	["tags", "tags: [excalidraw]"],
];

// Top-level `key:` — YAML allows a lot here, but a plain unquoted or quoted
// scalar key is the entire vocabulary Obsidian frontmatter uses in practice.
const FRONTMATTER_KEY_RE = /^(?:(["'])(.*?)\1|([^:#\s][^:]*?))\s*:(?:\s|$)/;

// A bare scalar that YAML would misread: an indicator at the start, an
// embedded ": " or " #", or a line break.
const YAML_UNSAFE_SCALAR: readonly RegExp[] = [
	/^[-?:,[\]{}#&*!|>'"%@`]/,
	/:\s/,
	/\s#/,
	/[\r\n]/,
];

type FrontmatterScan =
	| { kind: "none" }
	| { kind: "ok"; lines: string[] }
	| { kind: "malformed"; reason: string };

/**
 * The lower-cased key a top-level frontmatter line declares.
 * @param line One frontmatter line.
 * @returns The key, or null when the line is not a `key:` line.
 */
function frontmatterKey(line: string): string | null {
	const m = FRONTMATTER_KEY_RE.exec(line);
	if (!m) {
		return null;
	}
	return (m[2] ?? m[3] ?? "").trim().toLowerCase();
}

/**
 * The scalar after `key:`, unquoted. Anything that is not a plain scalar on
 * the same line (a list, a nested block, a block scalar) reads as undefined:
 * the caller's keys are always plain scalars, and misreading someone else's
 * structure would be worse than not reading it.
 * @param line One frontmatter line.
 * @returns The scalar value, or undefined when there is no plain scalar.
 */
function frontmatterScalar(line: string): string | undefined {
	const colon = line.indexOf(":");
	if (colon === -1) {
		return undefined;
	}
	const raw = line.slice(colon + 1).trim();
	if (raw === "") {
		return undefined;
	}
	const quoted = /^(["'])([\s\S]*)\1$/.exec(raw);
	if (quoted) {
		return quoted[2];
	}
	return raw.replace(/\s+#.*$/, "").trim();
}

/**
 * Render a value as a YAML scalar, quoting only when a bare scalar would be
 * misread so the frontmatter reads the way a human would have typed it.
 * @param value The value to render.
 * @returns The scalar text.
 */
function yamlScalar(value: string): string {
	const needsQuotes =
		value === "" || value !== value.trim() || YAML_UNSAFE_SCALAR.some((re) => re.test(value));
	if (!needsQuotes) {
		return value;
	}
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Read one top-level frontmatter key from a note.
 * @param content The whole note.
 * @param key The key to read, case-insensitively.
 * @returns The value, or undefined when the note has no readable frontmatter or the key is absent.
 */
function readFrontmatterValue(content: string, key: string): string | undefined {
	const scan = scanFrontmatter(content);
	if (scan.kind !== "ok") {
		return undefined;
	}
	const wanted = key.toLowerCase();
	for (const line of scan.lines) {
		if (/^\s/.test(line)) {
			continue;
		}
		if (frontmatterKey(line) === wanted) {
			return frontmatterScalar(line);
		}
	}
	return undefined;
}

/**
 * Set one top-level key on a note that already exists, leaving every other
 * byte of it alone.
 *
 * The write path renders a whole note and only then knows what its version
 * should be (src/runtime/engine/board-io.ts): the counter moves when the
 * rendered document differs from the destination, so it cannot be an input to
 * the render. Rendering twice to settle one line would mean serialising a
 * scene that can be megabytes for a second time, so the line is set on the
 * rendered text instead.
 *
 * The frontmatter block is rebuilt through the same upsert the render uses, so
 * a key that is already right is left untouched and a new one lands where
 * every other new key lands. Everything from the closing `---` down is carried
 * through as the bytes it already was.
 * @param note The rendered note.
 * @param key The key to set.
 * @param value The value to set.
 * @returns The note with the key set, or unchanged when it has no readable frontmatter.
 */
function setFrontmatterValue(note: string, key: string, value: string): string {
	const scan = scanFrontmatter(note);
	if (scan.kind !== "ok") {
		return note;
	}
	// Where the block ends in the original text, so everything below it is
	// spliced across as the bytes it already was rather than being split into
	// lines and joined back up.
	const close = closingDelimiterEnd(note);
	if (close === null) {
		return note;
	}
	return renderFrontmatter(upsertFrontmatterLines(scan.lines, [[key, value]])) + note.slice(close);
}

/**
 * The offset just past the newline that ends the frontmatter's closing `---`.
 * @param note The whole note.
 * @returns The offset, or null when no closing delimiter exists.
 */
function closingDelimiterEnd(note: string): number | null {
	let at = note.indexOf("\n");
	if (at === -1) {
		return null;
	}
	while (at !== -1) {
		const start = at + 1;
		const next = note.indexOf("\n", start);
		const line = note.slice(start, next === -1 ? undefined : next);
		if (/^(---|\.\.\.)[ \t]*\r?$/.test(line)) {
			return next === -1 ? note.length : next + 1;
		}
		at = next;
	}
	return null;
}

/**
 * The index after the last non-blank line, where a new key is appended so the
 * block keeps whatever trailing blank line it had.
 * @param lines The frontmatter body.
 * @returns The insertion index.
 */
function appendIndex(lines: readonly string[]): number {
	let insertAt = lines.length;
	while (insertAt > 0 && lines[insertAt - 1]!.trim() === "") {
		insertAt--;
	}
	return insertAt;
}

/**
 * Set frontmatter keys in place. Idempotent by construction: a key already
 * holding the wanted value leaves its line byte-for-byte untouched, so
 * re-exporting an unchanged board produces an identical file. A changed value
 * rewrites only that line, keeping the key's position (and therefore the rest
 * of the block's ordering and formatting) intact. A new key is appended after
 * the last non-blank line, the same place REQUIRED_FRONTMATTER goes.
 * @param lines The current frontmatter body.
 * @param entries Key and value pairs to set.
 * @returns A new body with the entries applied.
 */
function upsertFrontmatterLines(
	lines: string[],
	entries: ReadonlyArray<[string, string]>,
): string[] {
	const out = [...lines];
	for (const [key, value] of entries) {
		const wanted = key.toLowerCase();
		const rendered = `${key}: ${yamlScalar(value)}`;
		const at = out.findIndex((line) => !/^\s/.test(line) && frontmatterKey(line) === wanted);
		if (at !== -1) {
			if (frontmatterScalar(out[at]!) !== value) {
				out[at] = rendered;
			}
			continue;
		}
		out.splice(appendIndex(out), 0, rendered);
	}
	return out;
}

/**
 * Walk from the opening `---` to the closing delimiter, collecting the lines
 * between and allocating nothing else.
 * @param text The note without its byte-order mark.
 * @returns The body lines, or null when the block is never closed.
 */
function frontmatterBody(text: string): string[] | null {
	const body: string[] = [];
	let at = text.indexOf("\n");
	while (at !== -1) {
		const start = at + 1;
		const next = text.indexOf("\n", start);
		const raw = text.slice(start, next === -1 ? undefined : next);
		// `\r` belongs to the line ending rather than to the line, which is what
		// the split by `/\r?\n/` this replaced was saying.
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		if (/^(---|\.\.\.)[ \t]*$/.test(line)) {
			return body;
		}
		body.push(line);
		at = next;
	}
	return null;
}

/**
 * Whether a body line is something other than a top-level `key: value` pair
 * that still belongs in frontmatter: blank, a continuation or nested block,
 * or a comment.
 * @param line One body line.
 * @returns True when the line needs no key.
 */
function isStructuralLine(line: string): boolean {
	return line.trim() === "" || /^\s/.test(line) || line.startsWith("#");
}

/**
 * Reads the frontmatter block of an existing note. Deliberately conservative:
 * anything it cannot account for is reported as malformed rather than guessed
 * at, because the caller's fallback for "malformed" is to refuse to write
 * (never destroy content) while its fallback for "none" is to overwrite.
 *
 * A note is mostly scene, and none of it is read here. This used to `trim()`
 * and then `split()` the whole document to reach a block that is always in
 * its first few hundred bytes, so asking a 300-element board for one
 * frontmatter key allocated a copy of the note and an array of every line in
 * it. It walks to the closing delimiter now and allocates only the lines it
 * hands back. The empty-document test went with it: a document with nothing
 * in it does not start with `---` either.
 * @param content The whole note.
 * @returns The scan outcome.
 */
function scanFrontmatter(content: string): FrontmatterScan {
	const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
	// Obsidian only honours frontmatter that starts on the very first line.
	if (!/^---[ \t]*(\r?\n|$)/.test(text)) {
		return { kind: "none" };
	}
	const body = frontmatterBody(text);
	if (body === null) {
		return { kind: "malformed", reason: 'frontmatter block is never closed by a "---" line' };
	}
	const stray = body.find((line) => !isStructuralLine(line) && frontmatterKey(line) === null);
	if (stray !== undefined) {
		return {
			kind: "malformed",
			reason: `frontmatter line is not a "key: value" pair: ${JSON.stringify(stray)}`,
		};
	}
	return { kind: "ok", lines: body };
}

/**
 * The required plugin lines a body lacks.
 * @param lines The frontmatter body.
 * @returns The lines to append, in REQUIRED_FRONTMATTER order.
 */
function missingRequiredLines(lines: readonly string[]): string[] {
	const present = new Set(
		lines
			.filter((l) => !/^\s/.test(l))
			.map(frontmatterKey)
			.filter((k): k is string => k !== null),
	);
	return REQUIRED_FRONTMATTER.filter(([key]) => !present.has(key)).map(([, line]) => line);
}

/**
 * The frontmatter body to write, given the destination's current content.
 * Existing lines survive untouched; required keys are appended after the last
 * non-blank line so the block keeps whatever trailing blank line it had.
 * @param existing The destination's current content, or nothing for a fresh note.
 * @returns The body lines.
 * @throws {Error} When the destination's frontmatter cannot be read safely.
 */
function frontmatterLinesFor(existing: string | undefined | null): string[] {
	if (existing === undefined || existing === null) {
		return [...DEFAULT_FRONTMATTER_LINES];
	}
	const scan = scanFrontmatter(existing);
	if (scan.kind === "malformed") {
		throw new Error(
			`Refusing to overwrite the destination: ${scan.reason}. ` +
				"Fix or remove its frontmatter, then export again.",
		);
	}
	if (scan.kind === "none") {
		return [...DEFAULT_FRONTMATTER_LINES];
	}
	const lines = [...scan.lines];
	const missing = missingRequiredLines(lines);
	if (missing.length > 0) {
		lines.splice(appendIndex(lines), 0, ...missing);
	}
	return lines;
}

/**
 * The frontmatter block as note text.
 * @param lines The body lines.
 * @returns The block with its delimiters and trailing newline.
 */
function renderFrontmatter(lines: string[]): string {
	return `---\n${lines.join("\n")}\n---\n`;
}

/**
 * The note text below the frontmatter, which is where every region other
 * than the frontmatter's own begins.
 * @param content The whole note.
 * @returns The text after the closing delimiter, or the whole text when there is no frontmatter.
 */
function contentAfterFrontmatter(content: string): string {
	const text = content.replace(/^﻿/, "");
	const open = /^---[ \t]*(?:\r?\n|$)/.exec(text);
	if (!open) {
		return text;
	}
	const closer = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
	closer.lastIndex = open[0].length;
	const close = closer.exec(text);
	if (!close) {
		return text;
	} // unclosed: frontmatterLinesFor refuses the write
	return text.slice(close.index + close[0].length);
}

export {
	type FrontmatterScan,
	contentAfterFrontmatter,
	frontmatterLinesFor,
	readFrontmatterValue,
	renderFrontmatter,
	scanFrontmatter,
	setFrontmatterValue,
	upsertFrontmatterLines,
};
