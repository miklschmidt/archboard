// The note is the board. This module reads one and writes one, and it is the
// only place either happens (ADR 0015).
//
// Before this, a board opened once and then lived in the process: the elements,
// the images, the note's own bytes, and a hash taken at the moment it was read.
// A save wrote that copy out. Everything in between — every agent write, every
// drag a human made — moved the copy and left the note where it was, so the two
// diverged for as long as a session ran and four bugs came out of the gap.
//
// Now a request reads the note, works on what it read, and writes it back. What
// the process holds between requests is which boards are open and where each
// one's note is (src/core/board-store.ts); the content belongs to the request
// that read it and is gone when the response goes out.
//
// The cost is a read-modify-write per mutating request: 15.6 ms on a 56-element
// board and 18 to 23 ms on a 300-element one, of which the fsync is over half
// and does not vary with size (docs/design/server-is-the-truth.md §8). Against
// the busiest second of real use anybody has measured — seven writes — that is
// 110 to 162 ms, on a board four times larger than any real one. The estimate
// this was accepted on was 6.21 and 9.75 ms; the parse and the render came in
// where it said and the fsync is about twice what it said.
//
// EVERYTHING HERE IS SYNCHRONOUS, and that is load-bearing rather than
// incidental. Express runs synchronous handlers to completion one at a time, so
// two requests for one board cannot interleave their read-modify-write cycles
// and lose an update. An `await` anywhere between the read and the write would
// open exactly that window. Excluding a *second process* is a different problem
// and belongs to the board mutex (ADR 0016), not here.

import fs from 'fs';
import path from 'path';

import { ExcalidrawFile, ServerElement } from '../types.js';
import { writeFileAtomic } from './atomic-write.js';
import { BoardState, baselineForFile, recordBaseline } from './board-store.js';
import {
  BoardWriteConflict,
  boardKey,
  describeWriteConflict,
  hashBoardBytes,
  renderBoardNote,
  requireVaultRoot,
  sceneJsonWithEmbeddedImages
} from './board.js';
import { derivedId, isBlockId, mintId } from './ids.js';
import {
  isObsidianExcalidrawMd,
  extractSceneJsonFromObsidianMd,
  renameElementId
} from './obsidian-md.js';
import { buildScene } from './scene-io.js';

/**
 * One board, as one request found it.
 *
 * `elements` and `files` are what the note held, in the maps the routes work
 * against. `note` is the note's own text, carried so a write can put its
 * frontmatter and prose back verbatim, and `hash` is what those bytes hashed to
 * — the thing a write checks the destination against before it replaces it
 * (ADR 0006).
 *
 * Both are absent when there is nothing at the path yet: a board somebody has
 * just made, or a scratch board in a vault that has never held one.
 */
export interface BoardContent {
  elements: Map<string, ServerElement>;
  files: Map<string, ExcalidrawFile>;
  note?: string;
  hash?: string;
}

/** A board with nothing in it, for a note that is not there yet. */
export function emptyContent(): BoardContent {
  return { elements: new Map(), files: new Map() };
}

/**
 * Take a scene into the maps a request works against: its elements, and the
 * images those elements draw.
 *
 * Mirrors the batch-create path — ids preserved, server bookkeeping stamped —
 * so a board read from a note behaves exactly like one that was just drawn.
 *
 * The images used to be dropped here. An image element came back from a note
 * and its data did not, so the board reopened with a hole where the picture
 * was. That was a rendering failure while the process was the copy that
 * mattered; now the note is rewritten from what was read, so anything not read
 * back is deleted on the next write (TASK-060).
 */
export function ingestScene(
  sceneElements: unknown[],
  sceneFiles?: Record<string, unknown> | null
): { elements: Map<string, ServerElement>; files: Map<string, ExcalidrawFile> } {
  const elements = new Map<string, ServerElement>();
  // Names the scene brings with it are the only ones a mint here has to avoid:
  // the maps start empty and are filled from this scene alone.
  const taken = new Set<string>(
    sceneElements
      .filter((raw): raw is { id: string } => !!raw && typeof (raw as any).id === 'string')
      .map(raw => raw.id)
  );
  for (const raw of sceneElements) {
    if (!raw || typeof raw !== 'object') continue;
    const source = raw as Record<string, unknown>;
    const element: ServerElement = {
      ...(source as unknown as ServerElement),
      id: (typeof source.id === 'string' && source.id) || mintId(taken),
      createdAt: (source.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (source.updatedAt as string) ?? new Date().toISOString(),
      version: (source.version as number) ?? 1
    };
    taken.add(element.id);
    elements.set(element.id, element);
  }

  const files = new Map<string, ExcalidrawFile>();
  if (sceneFiles && typeof sceneFiles === 'object') {
    for (const [id, raw] of Object.entries(sceneFiles)) {
      if (!raw || typeof raw !== 'object') continue;
      const file = raw as Partial<ExcalidrawFile>;
      if (typeof file.dataURL !== 'string') continue;
      files.set(id, {
        id,
        dataURL: file.dataURL,
        mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'image/png',
        created: typeof file.created === 'number' ? file.created : Date.now()
      });
    }
  }
  return { elements, files };
}

/** The elements and images a note holds, plus the bytes they came out of. */
export function readNote(file: string): BoardContent | null {
  let bytes: Buffer;
  try {
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
  // A picture the Obsidian plugin moved out into a vault file is followed
  // here, not only when a board is opened (TASK-085, ADR 0017). Every request
  // reads the note now (ADR 0015), so this is the path that decides whether a
  // migrated board draws or renders holes. It costs nothing on a note with no
  // `## Embedded Files` section, which is reassembled only when there is one.
  const scene = JSON.parse(sceneJsonWithEmbeddedImages(raw, file, requireVaultRoot()));
  const { elements, files } = ingestScene(
    Array.isArray(scene) ? scene : (scene.elements ?? []),
    Array.isArray(scene) ? null : scene.files
  );
  return { elements, files, note: raw, hash: hashBoardBytes(bytes) };
}

/**
 * A board, read fresh.
 *
 * Every request that touches a board starts here, which is what makes the note
 * the answer to "what is on this board" rather than one of two answers. A board
 * whose note is not there yet — one `board new` has just started, a scratch
 * board in a fresh vault — reads as empty rather than failing: it exists, it is
 * open, and there is nothing on it.
 */
export function readBoardContent(board: BoardState): BoardContent {
  if (!board.file) return emptyContent();
  return readNote(board.file) ?? emptyContent();
}

/**
 * The note a board's content would be written as.
 *
 * `existingNote` is what is at the destination: its frontmatter and prose are
 * carried across verbatim and only the identity keys are touched, which is what
 * keeps two writes of an unchanged board byte-identical. It defaults to the note
 * this content came out of, and a write passes the destination's instead —
 * `board save --as other` writes a file some other note's frontmatter belongs
 * to.
 */
export function renderContent(
  identity: BoardState['identity'],
  content: BoardContent,
  elements: ServerElement[] = Array.from(content.elements.values()),
  existingNote: string | null | undefined = content.note
): { note: string; bytes: Buffer; elementCount: number } {
  const files: Record<string, ExcalidrawFile> = {};
  content.files.forEach((file, id) => { files[id] = file; });
  const { scene, elementCount } = buildScene(
    elements,
    files as unknown as Record<string, any>,
    { keepServerFields: true }
  );
  const note = renderBoardNote(scene, existingNote, identity);
  return { note, bytes: Buffer.from(note, 'utf-8'), elementCount };
}

/**
 * Give every text element an id that can be written as a block reference,
 * before the note writer has to.
 *
 * A text element's block id is its element id, and a block reference cannot
 * hold more than eight characters (`src/core/ids.ts`), so `wrapSceneAsObsidianMd`
 * renames a longer one on the way into a note. Nothing archboard mints needs
 * that (TASK-069); what does is what Excalidraw mints in a browser, and what a
 * caller supplies.
 *
 * While the process held the board, the two spellings could sit side by side:
 * the store said one thing, the note said another, and nobody compared them.
 * The note is the board now, so that rename decides the element's real name —
 * and it used to happen after the write's answer had already been computed, so
 * an agent was told an id the board did not hold and a pane rendered a document
 * whose next read would come back with the element renamed under it.
 *
 * So it happens here, once, on the way in: the map, the answer, the broadcast
 * and the note all say the same name. `wrapSceneAsObsidianMd` keeps its own
 * rename for notes archboard did not write.
 *
 * Deterministic, through the same `derivedId` the note writer used, so a board
 * already in a vault keeps the ids it has.
 */
/**
 * A text element carries the text the note's `## Text Elements` block lists.
 *
 * `rawText` is the Obsidian Excalidraw plugin's field: the text as somebody
 * wrote it, before links are resolved, and the note writer fills it in from the
 * element's own text when there is none. That used to happen on a copy on its
 * way into a file, so the board never had it — and a text element an agent
 * created came back from its own note carrying a field the pane had never been
 * sent (`scripts/check-live-session.mjs` caught it on cycle 15).
 *
 * Filled rather than restated: a note the plugin wrote can hold a `rawText`
 * that is genuinely different from its `text` — a `[[wikilink]]` against what
 * it resolves to — and overwriting that would throw away the link.
 */
function settleRawText(content: BoardContent): void {
  for (const element of content.elements.values()) {
    if (element.type !== 'text' || element.isDeleted) continue;
    const held = element as ServerElement & { rawText?: string; originalText?: string };
    if (typeof held.rawText === 'string' && held.rawText !== '') continue;
    held.rawText = held.originalText ?? held.text ?? '';
  }
}

function settleBlockIds(content: BoardContent): void {
  const foreign = Array.from(content.elements.values())
    .filter(element => element.type === 'text' && !element.isDeleted && !isBlockId(element.id));
  if (foreign.length === 0) return;
  const elements = Array.from(content.elements.values());
  const taken = { has: (id: string) => content.elements.has(id) };
  for (const element of foreign) {
    const oldId = element.id;
    const newId = derivedId(oldId, taken);
    renameElementId(elements, oldId, newId);
    content.elements.delete(oldId);
    content.elements.set(newId, element);
  }
}

/**
 * A shape an arrow is bound to says so, in its own `boundElements`.
 *
 * Excalidraw's model is two-sided: the arrow names the shape in `startBinding`
 * and `endBinding`, and the shape names the arrow back. The exporter has always
 * patched the second half in on the way into a file, and the board never had
 * it — which was survivable while the note and the store were different
 * documents, and is not now that they are one. The pane was handed a shape with
 * no reference to the arrow, the note was written with one, and the next read
 * brought back a document the pane did not have (`check-live-session.mjs`
 * caught it on the first cycle).
 *
 * So the board gets it too, before the write, in the same pass as the block
 * ids: what the caller is told, what the panes are sent and what the note holds
 * are one document.
 */
function settleBoundArrows(content: BoardContent): void {
  for (const arrow of content.elements.values()) {
    if (arrow.type !== 'arrow' && arrow.type !== 'line') continue;
    const joins = arrow as {
      startBinding?: { elementId?: string } | null;
      endBinding?: { elementId?: string } | null;
      start?: { id?: string };
      end?: { id?: string };
    };
    const ends = [
      joins.startBinding?.elementId,
      joins.endBinding?.elementId,
      joins.start?.id,
      joins.end?.id
    ];
    for (const shapeId of ends) {
      if (typeof shapeId !== 'string') continue;
      const shape = content.elements.get(shapeId);
      if (!shape || shape.id === arrow.id) continue;
      const bound = Array.isArray(shape.boundElements) ? shape.boundElements : [];
      if (bound.some(entry => entry?.id === arrow.id)) continue;
      shape.boundElements = [...bound, { id: arrow.id, type: 'arrow' as const }];
    }
  }
}

/**
 * A write archboard would not make, because somebody else has been here.
 *
 * Carries the conflict as data — the three outcomes and which one costs what —
 * so a surface can offer them rather than reword them (ADR 0006).
 */
export class BoardWriteConflictError extends Error {
  readonly conflict: BoardWriteConflict;
  constructor(conflict: BoardWriteConflict) {
    super(conflict.message);
    this.name = 'BoardWriteConflictError';
    this.conflict = conflict;
  }
}

export interface WriteOptions {
  /** Where the note goes. Defaults to the board's own note. */
  file?: string;
  /** The human's "overwrite it anyway". Never set by archboard on its own behalf. */
  force?: boolean;
  /** What a refusal should tell the caller to type. */
  saveCommand?: string;
  /** Written in place of the content's own elements: a branch's restamped copy. */
  elements?: ServerElement[];
  /** The identity to stamp into the frontmatter. Defaults to the board's own. */
  identity?: BoardState['identity'];
}

/**
 * Write a board to its note, or refuse.
 *
 * WHAT THE CHECK ASKS, AND WHY IT IS NOT THE BYTES THIS REQUEST JUST READ.
 * The operand is the baseline: the bytes archboard last put on screen or last
 * wrote at this path. It is deliberately not the read at the top of this
 * request, which would make the check vacuous — a note Obsidian rewrote a
 * second ago reads back cleanly, and applying a pane's delta to it would
 * silently merge two scenes that do not merge (ADR 0006).
 *
 * What ADR 0015 changes is how *recent* that baseline is. archboard used to
 * record a note's hash when it opened the board and check it at the next
 * explicit save, hours later, so the question was "did this change at some
 * point during the session". Every write goes through here now, so the baseline
 * is the one the previous write left milliseconds ago and the question is "did
 * somebody else get in between our last two writes". The refusal therefore
 * arrives on the gesture that follows a foreign edit rather than at the end of
 * an afternoon — and arrives without anybody having asked for a save, which is
 * TASK-079's problem, not this function's.
 *
 * Nothing is written when the check fails, so a refused write leaves the vault
 * exactly as it found it, empty directories included.
 */
export function writeBoardContent(
  board: BoardState,
  content: BoardContent,
  options: WriteOptions = {}
): { file: string; hash: string; note: string; elementCount: number; overwrote: boolean } {
  const file = options.file ?? board.file;
  if (!file) {
    throw new Error(`Board "${boardKey(board.identity)}" has no note to write to.`);
  }
  const identity = options.identity ?? board.identity;
  // Before anything is rendered or checked, so what the caller is holding and
  // what the note will say are the same document.
  settleBlockIds(content);
  settleBoundArrows(content);
  settleRawText(content);

  // The destination as it stands right now, not as this request found it.
  let destination: Buffer | undefined;
  try {
    destination = fs.readFileSync(file);
  } catch { /* nothing there: nothing to conflict with */ }
  const overwrote = destination !== undefined;

  if (destination && !options.force) {
    const actualHash = hashBoardBytes(destination);
    // Asked of the whole registry rather than of this board, because a
    // baseline belongs to a path: `board save --as other` writes a file some
    // other open board is the one that read.
    const expected = baselineForFile(file);
    if (!expected || expected.hash !== actualHash) {
      throw new BoardWriteConflictError(describeWriteConflict({
        target: identity,
        file,
        reason: expected ? 'changed' : 'unseen',
        ...(expected ? { expectedHash: expected.hash, lastReadAt: expected.at } : {}),
        actualHash,
        fileModifiedAt: fs.statSync(file).mtime.toISOString(),
        saveCommand: options.saveCommand ?? `board save --board ${boardKey(identity)}`
      }));
    }
  }

  const { note, bytes, elementCount } = renderContent(
    identity,
    content,
    options.elements,
    // The destination's own frontmatter and prose, not the source's: a save-as
    // onto an existing note keeps what that note's author put there.
    destination?.toString('utf-8')
  );
  // The folder for a nested name, made after the check rather than before it,
  // so a refused write leaves no directory behind.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // By rename, so a reader sees the old note or the new one and never a partial
  // (TASK-061). The note is the only copy of the board now, so a torn write is
  // the board rather than the last save.
  writeFileAtomic(file, bytes);

  const hash = hashBoardBytes(bytes);
  // What archboard has now seen at this path is what it just wrote — the
  // operand the *next* write's check compares against.
  recordBaseline(board, file, hash);
  return { file, hash, note, elementCount, overwrote };
}
