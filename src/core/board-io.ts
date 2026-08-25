// The note is the board. This module reads one and writes one, and it is the
// only place either happens (ADR 0015).
//
// One read, `readNoteFile`, under both callers that want a board out of a
// note: `readBoardFile` for `board open`, which wants the identity the note
// declares as well, and `readNote` for the per-request read, which wants the
// elements in the maps the routes work against. Resolving which file, reading
// it, and interpreting what came back are three jobs and only the middle one
// is shared — that middle one used to exist twice, and the second copy is what
// let TASK-085's fix miss the path every request takes.
//
// `writeBoardContent` reads the destination too and deliberately does not go
// through it: it hashes whatever bytes are there, including bytes that are not
// a note at all, because a foreign file at a board's path is the conflict it
// exists to report rather than an error it should throw.
//
// Before this, a board opened once and then lived in the process: the elements,
// the images, the note's own bytes, and a hash taken at the moment it was read.
// A save wrote that copy out. Everything in between — every agent write, every
// edit a user made — moved the copy and left the note where it was, so the two
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
import { holdOn } from './board-hold.js';
import { BoardState, baselineForFile, recordBaseline } from './board-store.js';
import {
  BoardIdentity,
  boardKey,
  hashBoardBytes,
  identityFromFrontmatter,
  identityFromVaultPath,
  makeIdentity,
  renderBoardNote,
  requireVaultRoot,
  sceneJsonWithEmbeddedImages,
  vaultPathFor
} from './board.js';
import {
  BoardWriteConflict,
  VersionMove,
  describeWriteConflict,
  stampBoardVersion,
  versionMove,
  versionNumber
} from './board-version.js';
import { validateRenderGeometry } from './geometry.js';
import { derivedId, isBlockId, mintId } from './ids.js';
import {
  isObsidianExcalidrawMd,
  renameElementId
} from './obsidian-md.js';
import { stripBindingPresentationLinks } from './presentation.js';
import { buildScene } from './scene-document.js';

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
  /**
   * Which edit of the board the note was, when it was read (TASK-091). Null for
   * a note that carries no version archboard can read, absent for a board with
   * no note behind it yet.
   */
  version?: number | null;
}

/**
 * A board's images in the shape carried by scene messages, or nothing when it
 * has none. Every whole-board frame needs these records or image elements
 * render as holes (TASK-060).
 */
export function boardFilesMessage(content: BoardContent): { files?: Record<string, ExcalidrawFile> } {
  if (content.files.size === 0) return {};
  return { files: Object.fromEntries(content.files) };
}

/**
 * A note, plus the identity of the board it turned out to hold.
 *
 * What `board open` needs and a per-request read does not: a request already
 * knows which board it is working on, and opening one is the act that finds
 * out.
 */
export interface LoadedBoard extends NoteFile {
  identity: BoardIdentity;
  // What the note's own frontmatter claims, when that is a different board
  // than the one being opened — a note renamed or moved in Obsidian since it
  // was last saved. The path is the address, so that is what the caller gets;
  // the next save rewrites the frontmatter and the disagreement goes away.
  // Surfaced rather than silently reconciled, because it usually means a human
  // moved something and may not have meant to.
  declaredKey?: string;
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

  // A note already in the vault gets no silent repair. Refuse the whole scene
  // here, before any caller can register it or send it to a pane, and let the
  // existing board-open error path put the actionable geometry error on screen.
  validateRenderGeometry(elements.values());

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

/**
 * A note as it was found on disk.
 *
 * Whatever is true of reading a note is true here, because this is the only
 * place it happens: the `.excalidraw.md` refusal, the hash the next write is
 * checked against, and the pictures the Obsidian plugin moved out into vault
 * files.
 */
export interface NoteFile {
  file: string;
  /** The whole note, so a write can put its frontmatter and prose back verbatim. */
  raw: string;
  /** sha-256 of the bytes it was decoded from: the baseline operand (ADR 0006). */
  hash: string;
  /** Which edit of the board it was, or null when it carries no count (TASK-091). */
  version: number | null;
  /** The drawing, with any image the plugin moved out of it put back. */
  sceneJson: string;
}

/**
 * Read one note. THE one read: everything else here and in `board.ts` is
 * either working out which file, or working out what the result means.
 *
 * That is not tidiness, it is the bug this had. Two readers stood here — this
 * one for the per-request read every route takes (ADR 0015), and
 * `readBoardFile` for `board open` — and TASK-085 taught only one of them to
 * follow a migrated picture. The two merged with no conflict, and a board the
 * plugin had been through rendered holes on every read until `256369d`
 * repaired it with a targeted change. `scripts/check-boards.mjs` guards both
 * callers: it reads one migrated note through each caller below and asserts they agree on
 * the bytes, the hash, the picture and the refusal, and it asserts that exactly
 * one line in `src/` calls `sceneJsonWithEmbeddedImages`.
 *
 * `null` for a note that is not there. A board somebody has just made has no
 * file yet and that is not an error.
 */
export function readNoteFile(file: string, root = requireVaultRoot()): NoteFile | null {
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
  return {
    file,
    raw,
    hash: hashBoardBytes(bytes),
    version: versionNumber(raw),
    // A picture the plugin moved out into a vault file is followed here
    // (TASK-085, ADR 0017), which is what decides whether a migrated board
    // draws or renders holes. It costs nothing on a note with no
    // `## Embedded Files` section: the scene is reassembled only when one of
    // its links resolved to a file.
    sceneJson: sceneJsonWithEmbeddedImages(raw, file, root)
  };
}

/**
 * A board note, and who the note says it is.
 *
 * The address being opened is the identity, because that is how the file was
 * found; the note's frontmatter supplies `level`, which no path can carry, and
 * is reported when it names a different board — a note the Obsidian plugin
 * created has no archboard keys at all until archboard first saves it.
 *
 * Two jobs on top of the read, and only these two: turn an identity into a
 * path, and say what the note's own frontmatter claims. The bytes come back
 * exactly as any other read gets them.
 */
export function readBoardFile(
  identity: Pick<BoardIdentity, 'board' | 'variant' | 'displayName'>,
  root = requireVaultRoot()
): LoadedBoard | null {
  const note = readNoteFile(vaultPathFor(identity, root), root);
  if (!note) return null;

  const asked = makeIdentity({ board: identity.board, variant: identity.variant });
  const declared = identityFromFrontmatter(note.raw);
  // Casing comes from the note, not from whoever typed the address: the note
  // is where a human chose it and the address is case-insensitive either way.
  // Its own frontmatter first, then the filename, then the address.
  const onDisk = identityFromVaultPath(note.file, root);
  const displayName =
    (declared && boardKey(declared) === boardKey(asked) ? declared.displayName : undefined)
    ?? (onDisk && boardKey(onDisk) === boardKey(asked) ? onDisk.displayName : undefined)
    ?? asked.displayName;
  return {
    ...note,
    identity: {
      ...asked,
      ...(declared?.level ? { level: declared.level } : {}),
      ...(displayName ? { displayName } : {})
    },
    ...(declared && boardKey(declared) !== boardKey(asked) ? { declaredKey: boardKey(declared) } : {})
  };
}

/** The elements and images a note holds, plus the bytes they came out of. */
export function readNote(file: string): BoardContent | null {
  const note = readNoteFile(file);
  if (!note) return null;
  const scene = JSON.parse(note.sceneJson);
  const { elements, files } = ingestScene(
    Array.isArray(scene) ? scene : (scene.elements ?? []),
    Array.isArray(scene) ? null : scene.files
  );
  return { elements, files, note: note.raw, hash: note.hash, version: note.version };
}

/**
 * A board, read fresh.
 *
 * Every request that touches a board starts here, which is what makes the note
 * the answer to "what is on this board" rather than one of two answers. A board
 * whose note is not there yet — one `board new` has just started, a scratch
 * board in a fresh vault — reads as empty rather than failing: it exists, it is
 * open, and there is nothing on it.
 *
 * A board on hold is the one case where the note is not the answer, and it is
 * not an exception to ADR 0015 so much as the situation ADR 0015 assumes cannot
 * be avoided: the note has been taken over by another editor, so it holds their
 * board and not this one (src/core/board-hold.ts). There is still exactly one
 * answer here, which is the whole property — every reader, every describe,
 * every pane and the change feed come through this line and see the same board.
 *
 * The maps are copied so that a request which throws half way through leaves
 * the held copy as it found it, the way a re-read from the note would. The
 * elements inside them are shared, so a write path that edited one in place
 * rather than replacing it would still reach through; that is TASK-084 and it
 * is no worse here than on the note.
 */
export function readBoardContent(board: BoardState): BoardContent {
  const hold = holdOn(boardKey(board.identity));
  if (hold) {
    return {
      ...hold.content,
      elements: new Map(hold.content.elements),
      files: new Map(hold.content.files)
    };
  }
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
  existingNote: string | null | undefined = content.note
): { note: string; bytes: Buffer; elementCount: number } {
  const files = boardFilesMessage(content).files ?? {};
  const { scene, elementCount } = buildScene(
    stripBindingPresentationLinks(content.elements.values()),
    files as unknown as Record<string, any>,
    { keepServerFields: true }
  );
  // expandElements normalizes a missing link to null, so apply the same
  // portability rule once more to the normalized copies.
  scene.elements = stripBindingPresentationLinks(scene.elements as ServerElement[]);
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
 * that (TASK-069), and a pane settles what Excalidraw minted before it reports
 * it, because renaming a text element somebody has an editor open on is how
 * typed characters disappear (TASK-098). So what still arrives here needing a
 * name is what a caller supplied and what came out of a note archboard did not
 * write.
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

/**
 * What archboard found at a path that it did not put there.
 *
 * Shaped so that `describeWriteConflict` can be spread straight onto it, which
 * is the point: one set of facts, and the refusal and the mark are two ways of
 * saying it.
 */
export interface ForeignWrite {
  file: string;
  reason: 'changed' | 'unseen';
  expectedHash?: string;
  actualHash: string;
  lastReadAt?: string;
  fileModifiedAt: string;
  /**
   * Which way the note's version moved between archboard's last write here and
   * now (TASK-091). The hash establishes that these are not archboard's bytes;
   * this says who wrote them. `unchanged` is the foreign writer named — a
   * version key is carried across a save verbatim by everything that does not
   * maintain it — `behind` is a revert or a pull, `ahead` is another archboard.
   */
  versionMove: VersionMove;
  /** What archboard last wrote there, and what the note says now. */
  expectedVersion: number | null;
  actualVersion: number | null;
}

/**
 * Has something that is not archboard written this note?
 *
 * ADR 0006's comparison, on its own, because two things ask it. A write asks in
 * order to refuse, and it asks about the bytes it has already read. The mark in
 * the board bar asks about a board nobody is writing, so that a person drawing
 * on a copy the vault no longer holds finds out before their next edit is
 * refused rather than after (TASK-062).
 *
 * They must not be two comparisons. The mark's whole claim is that it shows the
 * state in which the next write *would* be refused, and a second implementation
 * of the same question is a second implementation that drifts — showing a mark
 * over a write that would go through, or staying quiet over one that would not.
 * So the bytes come in from whoever read them and only the comparison lives
 * here.
 *
 * Nothing at the path is not somebody else's work: an empty destination is what
 * a `board new` writes into, and the write goes ahead. Bytes archboard has
 * never read are, because it cannot tell what writing over them would delete —
 * that is the `unseen` half of the same refusal.
 */
export function foreignWriteTo(file: string, destination: Buffer | undefined): ForeignWrite | null {
  if (!destination) return null;
  const actualHash = hashBoardBytes(destination);
  // Asked of the whole registry rather than of one board, because a baseline
  // belongs to a path: `board save --as other` writes a file some other open
  // board is the one that read.
  const expected = baselineForFile(file);
  if (expected && expected.hash === actualHash) return null;
  // Read only once the bytes are already known to differ: the version answers
  // "who wrote this", which is a question that only arises after the hash has
  // said somebody did. The hash still decides, and this only ever describes.
  const actualVersion = versionNumber(destination.toString('utf-8'));
  return {
    file,
    reason: expected ? 'changed' : 'unseen',
    ...(expected ? { expectedHash: expected.hash, lastReadAt: expected.at } : {}),
    actualHash,
    fileModifiedAt: fs.statSync(file).mtime.toISOString(),
    versionMove: versionMove(expected?.version ?? null, actualVersion),
    expectedVersion: expected?.version ?? null,
    actualVersion
  };
}

export interface WriteOptions {
  /** The human's "overwrite it anyway". Never set by archboard on its own behalf. */
  force?: boolean;
  /** What a refusal should tell the caller to type. */
  saveCommand: string;
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
 * arrives on the user edit that follows a foreign edit rather than at the end of
 * an afternoon — and arrives without anybody having asked for a save, which is
 * TASK-079's problem, not this function's.
 *
 * Nothing is written when the check fails, so a refused write leaves the vault
 * exactly as it found it, empty directories included.
 */
export function writeBoardContent(
  board: BoardState,
  content: BoardContent,
  options: WriteOptions
): {
  file: string;
  hash: string;
  note: string;
  elementCount: number;
  overwrote: boolean;
  version: number | null;
} {
  const file = board.file;
  if (!file) {
    throw new Error(`Board "${boardKey(board.identity)}" has no note to write to.`);
  }
  const identity = board.identity;
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

  const foreign = options.force ? null : foreignWriteTo(file, destination);
  if (foreign) {
    throw new BoardWriteConflictError(describeWriteConflict({
      target: identity,
      ...foreign,
      saveCommand: options.saveCommand
    }));
  }

  const rendered = renderContent(
    identity,
    content,
    // The destination's own frontmatter and prose, not the source's: a save-as
    // onto an existing note keeps what that note's author put there.
    destination?.toString('utf-8')
  );
  const { note, bytes, version } = stampBoardVersion(rendered, destination);
  const { elementCount } = rendered;
  // The folder for a nested name, made after the check rather than before it,
  // so a refused write leaves no directory behind.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // By rename, so a reader sees the old note or the new one and never a partial
  // (TASK-061). The note is the only copy of the board now, so a torn write is
  // the board rather than the last save.
  writeFileAtomic(file, bytes);

  const hash = hashBoardBytes(bytes);
  // What archboard has now seen at this path is what it just wrote — the
  // operand the *next* write's check compares against, both halves of it.
  recordBaseline(board, file, hash, version);
  return { file, hash, note, elementCount, overwrote, version };
}
