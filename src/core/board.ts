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

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ARCHBOARD_VAULT } from './config.js';
import { ServerElement } from '../types.js';
import {
  readFrontmatterValue,
  isObsidianExcalidrawMd,
  extractSceneJsonFromObsidianMd,
  wrapSceneAsObsidianMd
} from './obsidian-md.js';

export interface BoardIdentity {
  board: string;
  variant: string;
  level?: string;
}

// The variant that means "the architecture that exists". Privileged: it owns
// the unadorned filename and is the default everywhere a variant is optional.
export const CURRENT_VARIANT = 'current';

// The board the canvas holds before anything has been opened. Not vault-backed:
// it has nowhere to save to until it is given a name (`board save --as`).
export const SCRATCH_BOARD = 'scratch';

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
export const FRONTMATTER_BOARD = 'board';
export const FRONTMATTER_VARIANT = 'variant';
export const FRONTMATTER_LEVEL = 'level';

export const BOARD_FILE_SUFFIX = '.excalidraw.md';

// The abstraction tiers in use today. A controlled vocabulary that grows by
// being edited, so this is advisory rather than enforced — `promote --level`
// accepts anything slug-shaped and boards must not be stricter than the nodes
// on them.
export const LEVELS = ['system', 'service', 'module'] as const;

const SLUG_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
// `@` separates name from variant, so it can never appear in a name. The rest
// are characters that are hostile in a path or in an Obsidian wiki-link.
const NAME_SEGMENT_BAD_RE = /[@\\:*?"<>|[\]#^]/;

export function validateBoardName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('Board name is required');
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    throw new Error(`Invalid board name "${name}": it must not start or end with "/"`);
  }
  const segments = trimmed.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`Invalid board name "${name}": "${segment}" is not a usable path segment`);
    }
    if (segment !== segment.trim()) {
      throw new Error(`Invalid board name "${name}": path segments must not be padded with whitespace`);
    }
    if (NAME_SEGMENT_BAD_RE.test(segment)) {
      throw new Error(
        `Invalid board name "${name}": "@ \\ : * ? " < > | [ ] # ^" are reserved ` +
        '("@" separates the variant; the rest break paths or Obsidian links)'
      );
    }
    if (/[\u0000-\u001f\u007f]/.test(segment)) {
      throw new Error(`Invalid board name "${name}": control characters are not allowed`);
    }
  }
  return trimmed;
}

export function validateVariant(variant: string): string {
  const trimmed = variant.trim();
  if (trimmed === '') throw new Error('Variant is required');
  if (!SLUG_RE.test(trimmed)) {
    throw new Error(
      `Invalid variant "${variant}": use letters, digits, "-", "_" or "." (e.g. current, proposed, option-a)`
    );
  }
  return trimmed;
}

export function validateLevel(level: string): string {
  const trimmed = level.trim();
  if (trimmed === '') throw new Error('Level is required');
  if (!SLUG_RE.test(trimmed)) {
    throw new Error(
      `Invalid level "${level}": use letters, digits, "-", "_" or "." ` +
      `(the vocabulary in use is ${LEVELS.join(', ')})`
    );
  }
  return trimmed;
}

export function makeIdentity(input: {
  board: string;
  variant?: string;
  level?: string;
}): BoardIdentity {
  return {
    board: validateBoardName(input.board),
    variant: validateVariant(input.variant ?? CURRENT_VARIANT),
    ...(input.level !== undefined && input.level !== '' ? { level: validateLevel(input.level) } : {})
  };
}

// The address of a board: what a human says and what the store is keyed by.
export function boardKey(identity: Pick<BoardIdentity, 'board' | 'variant'>): string {
  return identity.variant === CURRENT_VARIANT
    ? identity.board
    : `${identity.board}@${identity.variant}`;
}

// Parse an address back into an identity. Accepts a bare name (the `current`
// variant) or `name@variant`.
export function parseBoardKey(key: string): BoardIdentity {
  const at = key.lastIndexOf('@');
  if (at === -1) return makeIdentity({ board: key });
  return makeIdentity({ board: key.slice(0, at), variant: key.slice(at + 1) });
}

export function requireVaultRoot(): string {
  if (!ARCHBOARD_VAULT) {
    throw new Error(
      'No vault configured. Boards persist as .excalidraw.md notes in an Obsidian vault ' +
      'that spans repositories, so there is no sensible default. Set ARCHBOARD_VAULT to ' +
      'its absolute path (a .env file in the archboard checkout works) and restart the canvas server.'
    );
  }
  return path.resolve(ARCHBOARD_VAULT);
}

// Where a board lives. The identity is validated on the way in, so this cannot
// escape the vault; the containment check is kept anyway because a silent
// escape here writes a file into someone's home directory.
export function vaultPathFor(identity: Pick<BoardIdentity, 'board' | 'variant'>, root = requireVaultRoot()): string {
  const name = validateBoardName(identity.board);
  const variant = validateVariant(identity.variant);
  const base = variant === CURRENT_VARIANT ? name : `${name}@${variant}`;
  const resolved = path.resolve(root, `${base}${BOARD_FILE_SUFFIX}`);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`Refusing to resolve board "${boardKey(identity)}" outside the vault at ${root}`);
  }
  return resolved;
}

// The identity a vault path implies, before frontmatter is consulted.
export function identityFromVaultPath(filePath: string, root = requireVaultRoot()): BoardIdentity | null {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (!relative.endsWith(BOARD_FILE_SUFFIX)) return null;
  const base = relative.slice(0, -BOARD_FILE_SUFFIX.length).split(path.sep).join('/');
  try {
    return parseBoardKey(base);
  } catch {
    return null;
  }
}

// Frontmatter entries for an identity, in the order they are written.
export function identityFrontmatter(identity: BoardIdentity): Array<[string, string]> {
  const entries: Array<[string, string]> = [
    [FRONTMATTER_BOARD, identity.board],
    [FRONTMATTER_VARIANT, identity.variant]
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
      level: readFrontmatterValue(content, FRONTMATTER_LEVEL)
    });
  } catch {
    return null;
  }
}

// ─── Write conflicts ──────────────────────────────────────────
//
// A save is refused when the destination holds bytes archboard has not seen:
// either the note changed after archboard read it, or archboard never read it
// at all. Both mean the same thing — writing would delete something nobody was
// told about — so both are reported the same way, with the three outcomes a
// human can pick between. archboard never picks (ADR 0006).

export type BoardConflictReason = 'changed' | 'unseen';

export interface BoardWriteConflict {
  board: string;
  file: string;
  reason: BoardConflictReason;
  expectedHash?: string;
  actualHash: string;
  lastReadAt?: string;
  fileModifiedAt?: string;
  // The three ways out, as commands that can be run verbatim. Every surface
  // renders these; none of them invents a fourth.
  outcomes: { reload: string; overwrite: string; saveAs: string };
  message: string;
}

// A name for the copy on the canvas that cannot collide with what is on disk:
// a variant, because "the same board, a different take on it" is exactly what
// variants are for.
export function suggestSaveAsName(identity: Pick<BoardIdentity, 'board' | 'variant'>): string {
  const suffix = identity.variant === CURRENT_VARIANT ? 'from-canvas' : `${identity.variant}-from-canvas`;
  return `${identity.board}@${suffix}`;
}

const clock = (iso: string | undefined): string =>
  iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'unknown';

export function describeWriteConflict(input: {
  target: BoardIdentity;
  file: string;
  reason: BoardConflictReason;
  expectedHash?: string;
  actualHash: string;
  lastReadAt?: string;
  fileModifiedAt?: string;
  // How the save that was refused was addressed, so "run it again with --force"
  // is a command that actually does what it says.
  saveCommand: string;
}): BoardWriteConflict {
  const key = boardKey(input.target);
  const outcomes = {
    reload: `board open ${key} --reload`,
    overwrite: `${input.saveCommand} --force`,
    saveAs: `board save --as ${suggestSaveAsName(input.target)}`
  };

  const lead = input.reason === 'changed'
    ? `Refusing to save "${key}": ${input.file} changed on disk after archboard read it, so saving would ` +
      'delete that change. Nothing was written.\n' +
      `archboard read the note at ${clock(input.lastReadAt)}; the file was last modified ${clock(input.fileModifiedAt)}.`
    : `Refusing to save "${key}": there is already a note at ${input.file} that archboard has never read, ` +
      'so it cannot tell what saving would delete. Nothing was written.\n' +
      `That file was last modified ${clock(input.fileModifiedAt)}.`;

  const message = [
    lead,
    'Excalidraw scenes do not merge, so one of the two copies has to lose. Choose which:',
    `  reload     take the note, discard the canvas   ->  ${outcomes.reload}`,
    `  overwrite  keep the canvas, discard the note   ->  ${outcomes.overwrite}`,
    `  elsewhere  keep both, under another name       ->  ${outcomes.saveAs}`
  ].join('\n');

  return {
    board: key,
    file: input.file,
    reason: input.reason,
    ...(input.expectedHash ? { expectedHash: input.expectedHash } : {}),
    actualHash: input.actualHash,
    ...(input.lastReadAt ? { lastReadAt: input.lastReadAt } : {}),
    ...(input.fileModifiedAt ? { fileModifiedAt: input.fileModifiedAt } : {}),
    outcomes,
    message
  };
}

// Render a board as an Obsidian note. `existingNote` is the current content of
// the destination when there is one: its frontmatter and everything else the
// vault put there is carried across verbatim, and only the identity keys are
// touched — and only when their value actually changed. That is what keeps two
// saves of an unchanged board byte-identical.
export function renderBoardNote(
  scene: Record<string, any>,
  existingNote: string | null | undefined,
  identity: BoardIdentity
): string {
  return wrapSceneAsObsidianMd(scene, existingNote, { frontmatter: identityFrontmatter(identity) });
}

// Frontmatter lives at the top of the note; a board's scene JSON can be
// megabytes, and listing a vault must not read all of it.
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

function readHead(filePath: string, bytes = FRONTMATTER_PROBE_BYTES): string {
  const handle = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(handle, buffer, 0, bytes, 0);
    return buffer.subarray(0, read).toString('utf-8');
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
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// The live elements of a board note, from its raw bytes. Deleted elements are
// dropped, because a scene keeps its tombstones and nothing outside Excalidraw
// wants them.
export function extractSceneElements(note: string): ServerElement[] {
  if (!isObsidianExcalidrawMd(note)) {
    throw new Error('not an Obsidian .excalidraw.md note');
  }
  const scene = JSON.parse(extractSceneJsonFromObsidianMd(note));
  const raw: any[] = Array.isArray(scene) ? scene : (scene.elements ?? []);
  return raw.filter(el => el && typeof el === 'object' && !el.isDeleted) as ServerElement[];
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
      if (entry.name.startsWith('.')) continue;
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
      } catch { /* unreadable head: the path still names the board */ }
      // Level cannot be derived from a path, so it always comes from the note.
      const identity: BoardIdentity = { ...fromPath, ...(declared?.level ? { level: declared.level } : {}) };
      found.push({
        key: boardKey(identity),
        identity,
        file: full,
        ...(declared && boardKey(declared) !== boardKey(fromPath) ? { declaredKey: boardKey(declared) } : {})
      });
    }
  };

  walk(vault);
  found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return found;
}

export interface LoadedBoard {
  identity: BoardIdentity;
  file: string;
  raw: string;
  // The hash of the bytes this was read from: the baseline a later save checks
  // the file against before it overwrites it.
  hash: string;
  sceneJson: string;
  // What the note's own frontmatter claims, when that is a different board
  // than the one being opened. See VaultBoard.declaredKey.
  declaredKey?: string;
}

// Read a board note off disk.
//
// The address being opened is the identity, because that is how the file was
// found; the note's frontmatter supplies `level`, which no path can carry, and
// is reported when it names a different board — a note the Obsidian plugin
// created has no archboard keys at all until archboard first saves it.
export function readBoardFile(identity: Pick<BoardIdentity, 'board' | 'variant'>, root = requireVaultRoot()): LoadedBoard | null {
  const file = vaultPathFor(identity, root);
  let bytes: Buffer;
  try {
    // Read bytes, then decode. The baseline hash has to be of what is on disk,
    // so decoding is a separate step that cannot get between the two.
    bytes = fs.readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const raw = bytes.toString('utf-8');
  if (!isObsidianExcalidrawMd(raw)) {
    throw new Error(
      `${file} exists but is not an Obsidian .excalidraw.md note — refusing to read it as a board.`
    );
  }
  const asked = makeIdentity({ board: identity.board, variant: identity.variant });
  const declared = identityFromFrontmatter(raw);
  return {
    identity: { ...asked, ...(declared?.level ? { level: declared.level } : {}) },
    file,
    // The whole note, so a later save can carry its frontmatter across verbatim.
    raw,
    hash: hashBoardBytes(bytes),
    sceneJson: extractSceneJsonFromObsidianMd(raw),
    ...(declared && boardKey(declared) !== boardKey(asked) ? { declaredKey: boardKey(declared) } : {})
  };
}
