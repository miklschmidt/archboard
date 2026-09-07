// Note regions and embedded files of an Obsidian Excalidraw note.
//
// By the plugin's own convention a drawing note is two documents in one file:
// markdown above `# Excalidraw Data` is *the note* — the human's space, which
// is the whole reason a vault was chosen for persistence (ADR 0004) — and
// everything from that heading down is the plugin's serialised scene. So a
// note is five regions, of which archboard owns exactly one:
//
//   frontmatter  `---` .. `---`, round-tripped verbatim (obsidian-md-frontmatter)
//   body         up to `# Excalidraw Data`: the human's markdown, verbatim
//   data         the heading .. the closing fence of the Drawing block:
//                regenerated on every save — this is the scene
//   embedded     the `## Embedded Files` section inside the data region:
//                verbatim (see "embedded files" below)
//   trailing     everything after that fence: verbatim. Normally just the
//                `%%` closing the comment the plugin opened before
//                `## Drawing`, but a human who writes below it keeps it too.
//
// Regenerating the body — which is what archboard used to do — is silent data
// loss on the human's own writing, and it lands on every save rather than
// only on a forced one (TASK-017).

import { contentAfterFrontmatter } from "@/runtime/engine/lib/obsidian-md-frontmatter";

const BANNER = "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==";
// Enough of the banner to recognise one the plugin worded differently.
const BANNER_MARKER = "Switch to EXCALIDRAW VIEW";
// The blank lines are the plugin's own shape, kept so a note archboard writes
// from scratch is byte-identical to one the plugin would have written.
const DEFAULT_BODY = `${BANNER}\n\n\n`;
const DEFAULT_TRAILING = "\n%%";

const DATA_HEADING_RE = /^# Excalidraw Data[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface Line {
	start: number;
	text: string;
}

/**
 * Split text into lines that remember where they start, so a region can be
 * cut from the original text by offset rather than re-joined.
 * @param text The text to split.
 * @returns The lines in order, without their line endings.
 */
function eachLine(text: string): Line[] {
	const out: Line[] = [];
	let i = 0;
	for (;;) {
		let nl = text.indexOf("\n", i);
		const atEnd = nl === -1;
		if (atEnd) {
			nl = text.length;
		}
		let end = nl;
		if (end > i && text[end - 1] === "\r") {
			end--;
		}
		out.push({ start: i, text: text.slice(i, end) });
		if (atEnd) {
			return out;
		}
		i = nl + 1;
	}
}

/**
 * The offset of the start of the line containing an offset.
 * @param text The text.
 * @param offset An offset inside it.
 * @returns The line's start offset.
 */
function lineStartAt(text: string, offset: number): number {
	return text.lastIndexOf("\n", offset - 1) + 1;
}

// A `# Excalidraw Data` line that could be the start of the data region.
// `structural` means it is shaped like the real one — the plugin (and this
// module) always follow the heading with a `##` subsection or the `%%` that
// opens the Drawing comment, and prose almost never does.
interface HeadingCandidate {
	offset: number;
	structural: boolean;
}

/**
 * Whether a fence line closes an open fence: the same character, at least as
 * long, with no info string.
 * @param fenced The fence match on the current line.
 * @param fence The opening fence's characters.
 * @returns True when the line closes the fence.
 */
function closesFence(fenced: RegExpExecArray, fence: string): boolean {
	return (
		fenced[1]![0] === fence[0] && fenced[1]!.length >= fence.length && fenced[2]!.trim() === ""
	);
}

/**
 * Whether the heading at one line is followed (past blank lines) by a `##`
 * subsection or the `%%` that opens the Drawing comment.
 * @param lines All lines.
 * @param i The heading's line index.
 * @returns True when the heading is shaped like the plugin's own.
 */
function isStructuralHeading(lines: readonly Line[], i: number): boolean {
	let j = i + 1;
	while (j < lines.length && lines[j]!.text.trim() === "") {
		j++;
	}
	const next = j < lines.length ? lines[j]!.text : "";
	return next.startsWith("##") || next.trim() === "%%";
}

/**
 * Candidates in document order, skipping headings inside fenced code blocks:
 * a human documenting the format writes the plugin's headings in a fence, and
 * swallowing their fence would be the very bug this region model exists to
 * stop. Fence tracking only has to survive the human's own prose: the real
 * heading comes before the scene, so nothing in the serialised scene can
 * unbalance the scan that finds it.
 * @param text The note below its frontmatter.
 * @returns Every `# Excalidraw Data` line outside a fence.
 */
function dataHeadingCandidates(text: string): HeadingCandidate[] {
	const lines = eachLine(text);
	const out: HeadingCandidate[] = [];
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.text;
		const fenced = FENCE_RE.exec(line);
		const fenceLine = fence !== null || fenced !== null;
		fence = fenceAfter(fence, fenced);
		if (fenceLine) {
			continue;
		}
		if (DATA_HEADING_RE.test(line)) {
			out.push({ offset: lines[i]!.start, structural: isStructuralHeading(lines, i) });
		}
	}
	return out;
}

/**
 * The open fence after one line: a line inside a fence closes it or leaves
 * it open, a fence line outside one opens it.
 * @param fence The fence open before the line, or null.
 * @param fenced The fence match on the line, or null.
 * @returns The fence open after the line, or null.
 */
function fenceAfter(fence: string | null, fenced: RegExpExecArray | null): string | null {
	if (fence !== null) {
		return fenced && closesFence(fenced, fence) ? null : fence;
	}
	return fenced ? fenced[1]! : null;
}

/**
 * Where the data region starts when the note has a Drawing block but no
 * heading archboard is willing to trust: the `%%` that opens the comment, or
 * the `## Drawing` line itself.
 * @param text The note below its frontmatter.
 * @param block The located Drawing block.
 * @returns The region's start offset.
 */
function drawingRegionStart(text: string, block: DrawingBlock): number {
	const drawingLine = block.start + (text.startsWith("\r\n", block.start) ? 2 : 1);
	const previous = lineStartAt(text, block.start);
	return text.slice(previous, block.start).trim() === "%%" ? previous : drawingLine;
}

/**
 * The body with the plugin's "this file is a drawing" banner. It is added
 * only when archboard is the one introducing the data section, never injected
 * into a note that already has one, because that would rewrite a note whose
 * human deleted the banner on purpose and break losslessness for it.
 * @param text The note below its frontmatter, which has no data section.
 * @returns The body to write.
 */
function bodyWithBanner(text: string): string {
	let body = text;
	if (body !== "" && !body.endsWith("\n")) {
		body += "\n";
	}
	if (body.includes(BANNER_MARKER)) {
		return body;
	}
	return body === "" ? DEFAULT_BODY : `${body}\n${DEFAULT_BODY}`;
}

// --- embedded files ----------------------------------------------------
//
// The plugin does not keep image bytes in the drawing. On its first save of a
// note it walks `scene.files`, writes every base64 entry out as a real file in
// the vault, records each one under a `## Embedded Files` heading as
// `<fileId>: [[vault/path.png]]`, and then sets `scene.files = {}`
// (ExcalidrawData.syncFiles / syncElements). Base64 in the Drawing block is an
// input format it accepts and migrates away from; its own notes carry none.
//
// So that section is the *only* record of where a board's pictures went, and
// archboard used to delete it: the data region is regenerated on every save
// and the section is inside it. The image files stayed in the vault with
// nothing left able to name them (TASK-085).
//
// archboard preserves the section rather than writing the plugin's shape
// itself. See docs/adr/0017: the two formats stay independent, and this is the
// same promise the frontmatter and the human's prose already get.
//
// `## Element Links` sits in the same region and is deliberately *not*
// preserved, because it is not a sole record: the plugin rebuilds it from the
// `link` field of the scene's own elements on load and on save
// (findNewElementLinksInScene / updateElementLinksFromScene), and it applies
// what it reads there back onto the element. Carrying a stale line across
// would put back a link somebody had deleted, which is the class of bug
// ADR 0015 exists to stop.

const EMBEDDED_HEADING_RE = /^#{1,2} Embedded [Ff]iles[ \t]*$/;
// `<fileId>: <target>` — the plugin's own `([\w\d]*):\s*` prefix, shared by
// every form a line can take (wikilink, hyperlink, equation, markdown image).
const EMBEDDED_ENTRY_RE = /^([\w\d]*):[ \t]+(.*)$/;
// A text element is written as `<its raw text> ^<block id>`, so a block
// reference is where one ends. Nothing below the last of them is text.
const BLOCK_REF_RE = / \^\S+[ \t]*$/;

type EmbeddedFileEntry =
	| { fileId: string; kind: "wikilink"; target: string }
	| { fileId: string; kind: "hyperlink"; target: string }
	| { fileId: string; kind: "other"; target: string };

/**
 * Classify one entry's target: a wikilink or hyperlink names a file the
 * caller can resolve; `other` covers the forms that do not (an equation's
 * `$$latex$$`, the plugin's markdown-image token), which archboard carries
 * but cannot resolve.
 * @param fileId The entry's file id.
 * @param target The text after the id.
 * @returns The classified entry.
 */
function classifyEmbeddedEntry(fileId: string, target: string): EmbeddedFileEntry {
	const wikilink = /^!?\[\[([^\]]*)\]\]/.exec(target);
	if (wikilink) {
		return { fileId, kind: "wikilink", target: wikilink[1]! };
	}
	if (/^(?:https?|file|ftps?):\/\/\S+$/.test(target)) {
		return { fileId, kind: "hyperlink", target };
	}
	return { fileId, kind: "other", target };
}

/**
 * The entries of an `## Embedded Files` section, in document order.
 * @param section The section text.
 * @returns The entries.
 */
function readEmbeddedFiles(section: string): EmbeddedFileEntry[] {
	const out: EmbeddedFileEntry[] = [];
	for (const { text } of eachLine(section)) {
		const entry = EMBEDDED_ENTRY_RE.exec(text);
		if (!entry || entry[1] === "") {
			continue;
		}
		out.push(classifyEmbeddedEntry(entry[1]!, entry[2]!.trim()));
	}
	return out;
}

/**
 * The index just past the last block reference, below which the section
 * heading may be looked for.
 * @param lines The data region's lines.
 * @returns The first line index that can start the section.
 */
function afterLastBlockReference(lines: readonly Line[]): number {
	let first = 0;
	for (let i = 0; i < lines.length; i++) {
		if (BLOCK_REF_RE.test(lines[i]!.text)) {
			first = i + 1;
		}
	}
	return first;
}

/** Where an entry scan stands: the last line kept and how many entries it found. */
interface EntryScan {
	last: number;
	entries: number;
}

/**
 * Walk the entry lines below a heading: entries and blank lines continue the
 * section, an unterminated `$$` equation continues it to its closing `$$`,
 * and any other line ends it.
 * @param lines The data region's lines.
 * @param at The heading's line index.
 * @returns The scan outcome.
 */
function scanEmbeddedEntries(lines: readonly Line[], at: number): EntryScan {
	const scan: EntryScan = { last: at, entries: 0 };
	let inEquation = false;
	for (let i = at + 1; i < lines.length; i++) {
		const line = lines[i]!.text;
		if (inEquation) {
			scan.last = i;
			inEquation = !line.includes("$$");
			continue;
		}
		if (line.trim() === "") {
			continue;
		}
		const entry = EMBEDDED_ENTRY_RE.exec(line);
		if (!entry) {
			break;
		}
		scan.entries++;
		scan.last = i;
		inEquation = (entry[2]!.match(/\$\$/g) ?? []).length % 2 === 1;
	}
	return scan;
}

/**
 * The section as it stands in the data region, or '' when there is none
 * worth keeping. Two rules keep a text element from being mistaken for one:
 * the heading is looked for only below the last block reference (a text
 * element always ends in its own, so a heading a human typed into a label can
 * never start the section), and the section stops at the first line that is
 * not an entry, a section with no entries being nothing (the plugin only
 * writes the heading when it has something to list). Without them a note
 * would grow by one copy of the impostor's text on every save.
 * @param text The note below its frontmatter.
 * @param from The data region's markdown start.
 * @param to The data region's markdown end.
 * @returns The section text ending in a newline, or ''.
 */
function embeddedFilesSection(text: string, from: number, to: number): string {
	const lines = eachLine(text.slice(from, to));
	const first = afterLastBlockReference(lines);
	const at = lines.findIndex((line, i) => i >= first && EMBEDDED_HEADING_RE.test(line.text));
	if (at === -1) {
		return "";
	}
	const { last, entries } = scanEmbeddedEntries(lines, at);
	if (entries === 0) {
		return "";
	}
	const end = lines[last]!.start + lines[last]!.text.length;
	return text.slice(from + lines[at]!.start, from + end) + "\n";
}

interface PreservedRegions {
	body: string;
	embedded: string;
	trailing: string;
}

/**
 * The regions of a note that has no data section of its own.
 * @param body The body to keep.
 * @returns Regions with the plugin's default trailing text and no embedded section.
 */
function freshRegions(body: string): PreservedRegions {
	return { body, embedded: "", trailing: DEFAULT_TRAILING };
}

/**
 * Where the data region starts. The first plugin-shaped heading is the data
 * section. Falling back to the *last* candidate matters: with a Drawing block
 * present, leaving any `# Excalidraw Data` line in the preserved body would
 * duplicate the heading on write and duplicate it again on the next save.
 * @param text The note below its frontmatter.
 * @param block The Drawing block, when there is one.
 * @returns The start offset, or null when the note has no data region.
 */
function dataRegionStart(text: string, block: DrawingBlock | null): number | null {
	const candidates = dataHeadingCandidates(text).filter(
		(c) => block === null || c.offset < block.start,
	);
	const heading =
		candidates.find((c) => c.structural) ?? (block ? candidates[candidates.length - 1] : undefined);
	if (heading) {
		return heading.offset;
	}
	return block ? drawingRegionStart(text, block) : null;
}

/**
 * Split the destination into the regions a save must carry across untouched.
 * @param existing The destination's current content, or nothing for a fresh note.
 * @returns The preserved regions.
 */
function preservedRegions(existing: string | null | undefined): PreservedRegions {
	if (existing === undefined || existing === null) {
		return freshRegions(DEFAULT_BODY);
	}
	const text = contentAfterFrontmatter(existing);
	if (text.trim() === "") {
		return freshRegions(DEFAULT_BODY);
	}
	const block = locateDrawingBlock(text);
	const start = dataRegionStart(text, block);
	if (start === null) {
		return freshRegions(bodyWithBanner(text));
	}
	return regionsAround(text, block, start);
}

/**
 * The regions of a note that has a data section starting at `start`. The
 * data region's markdown runs from its heading to the `%%` (or the
 * `## Drawing` line) that opens the scene, which is where the section the
 * plugin owns has to be looked for and nowhere else.
 * @param text The note below its frontmatter.
 * @param block The Drawing block, when there is one.
 * @param start The data region's start offset.
 * @returns The preserved regions.
 */
function regionsAround(text: string, block: DrawingBlock | null, start: number): PreservedRegions {
	const markdownEnd = block ? drawingRegionStart(text, block) : text.length;
	return {
		body: text.slice(0, start),
		embedded: start < markdownEnd ? embeddedFilesSection(text, start, markdownEnd) : "",
		trailing: block ? text.slice(block.end) : DEFAULT_TRAILING,
	};
}

/**
 * What a whole note says about where its images went. Runs through the same
 * region split the writer preserves, so reading the section and keeping it
 * across a save can never disagree about which bytes it is, for the same
 * reason `locateDrawingBlock` is one locator for both directions.
 * @param note The whole note.
 * @returns The embedded file entries.
 */
function embeddedFilesIn(note: string): EmbeddedFileEntry[] {
	return readEmbeddedFiles(preservedRegions(note).embedded);
}

// The closing fence must sit at the start of a line: element text can contain
// ``` inside the JSON strings, but a line of pretty-printed JSON never begins
// with a backtick (this mirrors the plugin's own DRAWING_REG).
//
// Every line break matches `\r?\n`: files authored on Windows (or by the
// Obsidian plugin there) use CRLF, and requiring a bare `\n` made every such
// file fail with a misleading "No Drawing block found".
const DRAWING_COMPRESSED_RE = /\r?\n##? Drawing\r?\n[^`]*```compressed-json\r?\n([\s\S]*?)\r?\n```/;
const DRAWING_PLAIN_RE = /\r?\n##? Drawing\r?\n[^`]*```json\r?\n([\s\S]*?)\r?\n```/;

interface DrawingBlock {
	start: number;
	end: number;
	compressed: boolean;
	payload: string;
}

/**
 * One locator for both directions: reading the scene and deciding which bytes
 * a save may regenerate must never disagree about which block is the drawing.
 * @param md The note text.
 * @returns The Drawing block, or null when the note has none.
 */
function locateDrawingBlock(md: string): DrawingBlock | null {
	const compressed = DRAWING_COMPRESSED_RE.exec(md);
	const plain = compressed ? null : DRAWING_PLAIN_RE.exec(md);
	const match = compressed ?? plain;
	if (!match) {
		return null;
	}
	return {
		start: match.index,
		end: match.index + match[0].length,
		compressed: compressed !== null,
		payload: match[1]!,
	};
}

export {
	type DrawingBlock,
	type EmbeddedFileEntry,
	type PreservedRegions,
	embeddedFilesIn,
	locateDrawingBlock,
	preservedRegions,
	readEmbeddedFiles,
};
