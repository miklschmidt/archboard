// Obsidian Excalidraw plugin file format (.excalidraw.md).
//
// The Obsidian Excalidraw plugin opens raw .excalidraw JSON only in a limited
// "compatibility mode" ("Convert to new format for full plugin functionality").
// Its native format is markdown: frontmatter, a "# Excalidraw Data" section
// whose "## Text Elements" entries expose each text element as an Obsidian
// block reference, and the scene JSON in a "## Drawing" code block — either
// plain ```json or lz-string ```compressed-json (the plugin's default).
//
// wrap mirrors the plugin's own id semantics (ExcalidrawData.
// findNewTextElementsInScene): a text element's block id IS its element id,
// and ids longer than 8 characters are renamed to a fresh 8-char id with
// every scene reference rewired — so files we write and files the plugin
// re-saves stay block-reference-compatible.
//
// That rename is a last resort, not a step. Every id archboard mints is
// already a block id (`ids.ts`), so on a board this server wrote there is
// nothing here to rename; what is left for it are ids that came from
// somewhere else — Excalidraw's own 21-character nanoids, an imported scene,
// a hand-edited note. The rename is deterministic and the derivation has not
// changed, so a note written by an older archboard keeps the ids it has.
//
// A save regenerates the scene and nothing else: see "note regions" below.
// Everything a human wrote in the note — frontmatter, prose above the data
// section, prose below it — is carried across verbatim.

import { canonicalizeKeys } from './expand-elements.js';
import { derivedId, isBlockId } from './ids.js';

export function isObsidianExcalidrawMd(content: string): boolean {
  // Raw scene JSON always starts with { or [ — never treat it as markdown,
  // even when a text element happens to contain the marker strings.
  const head = content.trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return false;
  return content.includes('# Excalidraw Data') || /^---[\s\S]*?excalidraw-plugin:/m.test(content);
}

function renameElementId(elements: any[], oldId: string, newId: string): void {
  for (const el of elements) {
    if (el.id === oldId) el.id = newId;
    if (Array.isArray(el.boundElements)) {
      for (const bound of el.boundElements) {
        if (bound.id === oldId) bound.id = newId;
      }
    }
    if (el.startBinding?.elementId === oldId) el.startBinding.elementId = newId;
    if (el.endBinding?.elementId === oldId) el.endBinding.elementId = newId;
    if (el.containerId === oldId) el.containerId = newId;
  }
}

// --- frontmatter -------------------------------------------------------
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
const DEFAULT_FRONTMATTER_LINES = ['', 'excalidraw-plugin: parsed', 'tags: [excalidraw]', ''];

// Keys the Obsidian Excalidraw plugin needs to open the note as a drawing.
// Only added when absent — an existing value is the user's to control.
const REQUIRED_FRONTMATTER: ReadonlyArray<[key: string, line: string]> = [
  ['excalidraw-plugin', 'excalidraw-plugin: parsed'],
  ['tags', 'tags: [excalidraw]']
];

// Top-level `key:` — YAML allows a lot here, but a plain unquoted or quoted
// scalar key is the entire vocabulary Obsidian frontmatter uses in practice.
const FRONTMATTER_KEY_RE = /^(?:(["'])(.*?)\1|([^:#\s][^:]*?))\s*:(?:\s|$)/;

export type FrontmatterScan =
  | { kind: 'none' }
  | { kind: 'ok'; lines: string[] }
  | { kind: 'malformed'; reason: string };

function frontmatterKey(line: string): string | null {
  const m = FRONTMATTER_KEY_RE.exec(line);
  if (!m) return null;
  return (m[2] ?? m[3] ?? '').trim().toLowerCase();
}

// The scalar after `key:`, unquoted. Anything that is not a plain scalar on
// the same line (a list, a nested block, a block scalar) reads as undefined —
// the caller's keys are always plain scalars, and misreading someone else's
// structure would be worse than not reading it.
function frontmatterScalar(line: string): string | undefined {
  const colon = line.indexOf(':');
  if (colon === -1) return undefined;
  const raw = line.slice(colon + 1).trim();
  if (raw === '') return undefined;
  const quoted = /^(["'])([\s\S]*)\1$/.exec(raw);
  if (quoted) return quoted[2];
  return raw.replace(/\s+#.*$/, '').trim();
}

// Quote only when a bare scalar would be misread: YAML indicators at the
// start, an embedded ": " or " #", or surrounding whitespace. Everything else
// stays unquoted so the frontmatter reads the way a human would have typed it.
function yamlScalar(value: string): string {
  const needsQuotes =
    value === '' ||
    value !== value.trim() ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    /:\s/.test(value) ||
    /\s#/.test(value) ||
    /[\r\n]/.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Read one top-level frontmatter key from a note. Returns undefined when the
// note has no readable frontmatter or the key is absent.
export function readFrontmatterValue(content: string, key: string): string | undefined {
  const scan = scanFrontmatter(content);
  if (scan.kind !== 'ok') return undefined;
  const wanted = key.toLowerCase();
  for (const line of scan.lines) {
    if (/^\s/.test(line)) continue;
    if (frontmatterKey(line) === wanted) return frontmatterScalar(line);
  }
  return undefined;
}

// Set frontmatter keys in place. Idempotent by construction: a key already
// holding the wanted value leaves its line byte-for-byte untouched, so
// re-exporting an unchanged board produces an identical file. A changed value
// rewrites only that line, keeping the key's position (and therefore the rest
// of the block's ordering and formatting) intact. A new key is appended after
// the last non-blank line, the same place REQUIRED_FRONTMATTER goes.
function upsertFrontmatterLines(lines: string[], entries: ReadonlyArray<[string, string]>): string[] {
  const out = [...lines];
  for (const [key, value] of entries) {
    const wanted = key.toLowerCase();
    const rendered = `${key}: ${yamlScalar(value)}`;
    const at = out.findIndex((line) => !/^\s/.test(line) && frontmatterKey(line) === wanted);
    if (at !== -1) {
      if (frontmatterScalar(out[at]!) !== value) out[at] = rendered;
      continue;
    }
    let insertAt = out.length;
    while (insertAt > 0 && out[insertAt - 1]!.trim() === '') insertAt--;
    out.splice(insertAt, 0, rendered);
  }
  return out;
}

// Reads the frontmatter block of an existing note. Deliberately conservative:
// anything it cannot account for is reported as malformed rather than guessed
// at, because the caller's fallback for "malformed" is to refuse to write
// (never destroy content) while its fallback for "none" is to overwrite.
export function scanFrontmatter(content: string): FrontmatterScan {
  const text = content.replace(/^﻿/, '');
  if (text.trim() === '') return { kind: 'none' };
  // Obsidian only honours frontmatter that starts on the very first line.
  if (!/^---[ \t]*(\r?\n|$)/.test(text)) return { kind: 'none' };

  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { kind: 'malformed', reason: 'frontmatter block is never closed by a "---" line' };
  }

  const body = lines.slice(1, end);
  for (const line of body) {
    if (line.trim() === '') continue;
    if (/^\s/.test(line)) continue; // continuation / nested block / list item
    if (line.startsWith('#')) continue; // comment
    if (frontmatterKey(line) === null) {
      return { kind: 'malformed', reason: `frontmatter line is not a "key: value" pair: ${JSON.stringify(line)}` };
    }
  }
  return { kind: 'ok', lines: body };
}

// The frontmatter body to write, given the destination's current content.
// Existing lines survive untouched; required keys are appended after the last
// non-blank line so the block keeps whatever trailing blank line it had.
function frontmatterLinesFor(existing: string | undefined | null): string[] {
  if (existing === undefined || existing === null) return [...DEFAULT_FRONTMATTER_LINES];
  const scan = scanFrontmatter(existing);
  if (scan.kind === 'malformed') {
    throw new Error(
      `Refusing to overwrite the destination: ${scan.reason}. ` +
      'Fix or remove its frontmatter, then export again.'
    );
  }
  if (scan.kind === 'none') return [...DEFAULT_FRONTMATTER_LINES];

  const lines = [...scan.lines];
  const present = new Set(
    lines.filter((l) => !/^\s/.test(l)).map(frontmatterKey).filter((k): k is string => k !== null)
  );
  const missing = REQUIRED_FRONTMATTER.filter(([key]) => !present.has(key)).map(([, line]) => line);
  if (missing.length === 0) return lines;

  let insertAt = lines.length;
  while (insertAt > 0 && lines[insertAt - 1]!.trim() === '') insertAt--;
  lines.splice(insertAt, 0, ...missing);
  return lines;
}

function renderFrontmatter(lines: string[]): string {
  return `---\n${lines.join('\n')}\n---\n`;
}

// --- note regions ------------------------------------------------------
//
// By the plugin's own convention a drawing note is two documents in one file:
// markdown above `# Excalidraw Data` is *the note* — the human's space, which
// is the whole reason a vault was chosen for persistence (ADR 0004) — and
// everything from that heading down is the plugin's serialised scene. So a
// note is four regions, of which archboard owns exactly one:
//
//   frontmatter  `---` .. `---`, round-tripped verbatim (see above)
//   body         up to `# Excalidraw Data`: the human's markdown, verbatim
//   data         the heading .. the closing fence of the Drawing block:
//                regenerated on every save — this is the scene
//   trailing     everything after that fence: verbatim. Normally just the
//                `%%` closing the comment the plugin opened before
//                `## Drawing`, but a human who writes below it keeps it too.
//
// Regenerating the body — which is what archboard used to do — is silent data
// loss on the human's own writing, and it lands on every save rather than
// only on a forced one (TASK-017).

const BANNER = '==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==';
// Enough of the banner to recognise one the plugin worded differently.
const BANNER_MARKER = 'Switch to EXCALIDRAW VIEW';
// The blank lines are the plugin's own shape, kept so a note archboard writes
// from scratch is byte-identical to one the plugin would have written.
const DEFAULT_BODY = `${BANNER}\n\n\n`;
const DEFAULT_TRAILING = '\n%%';

const DATA_HEADING_RE = /^# Excalidraw Data[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface Line { start: number; text: string }

function eachLine(text: string): Line[] {
  const out: Line[] = [];
  let i = 0;
  for (;;) {
    let nl = text.indexOf('\n', i);
    const atEnd = nl === -1;
    if (atEnd) nl = text.length;
    let end = nl;
    if (end > i && text[end - 1] === '\r') end--;
    out.push({ start: i, text: text.slice(i, end) });
    if (atEnd) return out;
    i = nl + 1;
  }
}

function lineStartAt(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

// A `# Excalidraw Data` line that could be the start of the data region.
// `structural` means it is shaped like the real one — the plugin (and this
// module) always follow the heading with a `##` subsection or the `%%` that
// opens the Drawing comment, and prose almost never does.
interface HeadingCandidate { offset: number; structural: boolean }

// Candidates in document order, skipping headings inside fenced code blocks:
// a human documenting the format writes the plugin's headings in a fence, and
// swallowing their fence would be the very bug this region model exists to
// stop. Fence tracking only has to survive the human's own prose — the real
// heading comes before the scene, so nothing in the serialised scene can
// unbalance the scan that finds it.
function dataHeadingCandidates(text: string): HeadingCandidate[] {
  const lines = eachLine(text);
  const out: HeadingCandidate[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.text;
    const fenced = FENCE_RE.exec(line);
    if (fence !== null) {
      // A closing fence is the same character, at least as long, info-free.
      if (fenced && fenced[1]![0] === fence[0] && fenced[1]!.length >= fence.length && fenced[2]!.trim() === '') {
        fence = null;
      }
      continue;
    }
    if (fenced) { fence = fenced[1]!; continue; }
    if (!DATA_HEADING_RE.test(line)) continue;
    let j = i + 1;
    while (j < lines.length && lines[j]!.text.trim() === '') j++;
    const next = j < lines.length ? lines[j]!.text : '';
    out.push({ offset: lines[i]!.start, structural: next.startsWith('##') || next.trim() === '%%' });
  }
  return out;
}

// Where the data region starts when the note has a Drawing block but no
// heading archboard is willing to trust: the `%%` that opens the comment, or
// the `## Drawing` line itself.
function drawingRegionStart(text: string, block: DrawingBlock): number {
  const drawingLine = block.start + (text.startsWith('\r\n', block.start) ? 2 : 1);
  const previous = lineStartAt(text, block.start);
  return text.slice(previous, block.start).trim() === '%%' ? previous : drawingLine;
}

// The note text below the frontmatter, which is where every region above the
// frontmatter's own ends.
function contentAfterFrontmatter(content: string): string {
  const text = content.replace(/^﻿/, '');
  const open = /^---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!open) return text;
  const closer = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closer.lastIndex = open[0].length;
  const close = closer.exec(text);
  if (!close) return text; // unclosed: frontmatterLinesFor refuses the write
  return text.slice(close.index + close[0].length);
}

// The banner is the plugin's "this file is a drawing" affordance. It is added
// only when archboard is the one introducing the data section — never injected
// into a note that already has one, because that would rewrite a note whose
// human deleted the banner on purpose and break losslessness for it.
function bodyWithBanner(text: string): string {
  let body = text;
  if (body !== '' && !body.endsWith('\n')) body += '\n';
  if (body.includes(BANNER_MARKER)) return body;
  return body === '' ? DEFAULT_BODY : `${body}\n${DEFAULT_BODY}`;
}

interface PreservedRegions { body: string; trailing: string }

// Split the destination into the regions a save must carry across untouched.
function preservedRegions(existing: string | null | undefined): PreservedRegions {
  if (existing === undefined || existing === null) return { body: DEFAULT_BODY, trailing: DEFAULT_TRAILING };
  const text = contentAfterFrontmatter(existing);
  if (text.trim() === '') return { body: DEFAULT_BODY, trailing: DEFAULT_TRAILING };

  const block = locateDrawingBlock(text);
  const candidates = dataHeadingCandidates(text).filter((c) => block === null || c.offset < block.start);
  // The first plugin-shaped heading is the data section. Falling back to the
  // *last* candidate matters: with a Drawing block present, leaving any
  // `# Excalidraw Data` line in the preserved body would duplicate the heading
  // on write and duplicate it again on the next save.
  const heading = candidates.find((c) => c.structural) ?? (block ? candidates[candidates.length - 1] : undefined);

  const start = heading ? heading.offset : block ? drawingRegionStart(text, block) : null;
  if (start === null) return { body: bodyWithBanner(text), trailing: DEFAULT_TRAILING };
  return { body: text.slice(0, start), trailing: block ? text.slice(block.end) : DEFAULT_TRAILING };
}

// `existing` is the current content of the destination file, when there is
// one; pass nothing to get the plugin's default frontmatter. Throws when the
// destination's frontmatter cannot be read safely — callers must treat that as
// "do not write" rather than falling back to a fresh header.
export interface WrapOptions {
  // Frontmatter keys to set on the note — board identity, in practice. Upsert
  // semantics: unchanged values leave their lines untouched.
  frontmatter?: ReadonlyArray<[key: string, value: string]>;
}

export function wrapSceneAsObsidianMd(
  scene: Record<string, any>,
  existing?: string | null,
  options: WrapOptions = {}
): string {
  if (!Array.isArray(scene.elements)) {
    throw new Error('Not an Excalidraw scene: missing elements array');
  }
  // Resolved first so an unreadable destination fails before any work.
  const frontmatter = renderFrontmatter(
    upsertFrontmatterLines(frontmatterLinesFor(existing), options.frontmatter ?? [])
  );
  const { body, trailing } = preservedRegions(existing);
  const wrapped = structuredClone(scene);
  wrapped.type = 'excalidraw';
  wrapped.version = 2;
  wrapped.files = wrapped.files ?? {};

  const used = new Set<string>(wrapped.elements.map((el: any) => el.id));
  const entries: string[] = [];
  for (const el of wrapped.elements) {
    if (el.type !== 'text' || el.isDeleted) continue;
    // Nothing archboard minted lands here. An id that does came from
    // elsewhere and cannot be written as a block reference as it stands.
    if (!isBlockId(el.id)) {
      const newId = derivedId(el.id, used);
      used.add(newId);
      renameElementId(wrapped.elements, el.id, newId);
    }
    el.rawText = el.rawText && el.rawText !== '' ? el.rawText : (el.originalText ?? el.text ?? '');
    if (el.rawText !== '') entries.push(`${el.rawText} ^${el.id}`);
  }

  const textSection = entries.length ? entries.join('\n\n') + '\n' : '';
  return `${frontmatter}${body}# Excalidraw Data
## Text Elements
${textSection}
%%
## Drawing
\`\`\`json
${JSON.stringify(canonicalizeKeys(wrapped), null, '\t')}
\`\`\`${trailing}`;
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

interface DrawingBlock { start: number; end: number; compressed: boolean; payload: string }

// One locator for both directions. Reading the scene and deciding which bytes
// a save may regenerate must never disagree about which block is the drawing.
function locateDrawingBlock(md: string): DrawingBlock | null {
  const compressed = DRAWING_COMPRESSED_RE.exec(md);
  const plain = compressed ? null : DRAWING_PLAIN_RE.exec(md);
  const match = compressed ?? plain;
  if (!match) return null;
  return {
    start: match.index,
    end: match.index + match[0].length,
    compressed: compressed !== null,
    payload: match[1]!
  };
}

export function extractSceneJsonFromObsidianMd(md: string): string {
  const block = locateDrawingBlock(md);
  if (!block) throw new Error('No Drawing block found — not an .excalidraw.md file?');
  if (!block.compressed) {
    JSON.parse(block.payload);
    return block.payload;
  }
  const json = decompressFromBase64(block.payload.replace(/\s/g, ''));
  if (!json) throw new Error('Failed to decompress the Drawing block');
  JSON.parse(json);
  return json;
}

// lz-string decompressFromBase64 (pieroxy/lz-string, MIT), inlined to keep
// the package dependency-free.
const keyStrBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const f = String.fromCharCode;

function decompressFromBase64(input: string): string | null {
  if (input === '') return null;
  return _decompress(input.length, 32, (index) => keyStrBase64.indexOf(input.charAt(index)));
}

function _decompress(
  length: number,
  resetValue: number,
  getNextValue: (index: number) => number
): string | null {
  const dictionary: (string | number)[] = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry: string;
  let w: string;
  let c: number;
  const result: string[] = [];
  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  const readBits = (n: number): number => {
    let bits = 0;
    const maxpower = Math.pow(2, n);
    let power = 1;
    while (power !== maxpower) {
      const resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return bits;
  };

  for (let i = 0; i < 3; i += 1) dictionary[i] = i;

  let first: string;
  switch (readBits(2)) {
    case 0:
      first = f(readBits(8));
      break;
    case 1:
      first = f(readBits(16));
      break;
    default:
      return '';
  }
  dictionary[3] = first;
  w = first;
  result.push(first);
  while (true) {
    if (data.index > length) return '';
    switch ((c = readBits(numBits))) {
      case 0:
        dictionary[dictSize++] = f(readBits(8));
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        dictionary[dictSize++] = f(readBits(16));
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join('');
    }
    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }
    if (dictionary[c] !== undefined) {
      entry = dictionary[c] as string;
    } else if (c === dictSize) {
      entry = w + w.charAt(0);
    } else {
      return null;
    }
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }
  }
}
