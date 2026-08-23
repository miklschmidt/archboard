// Which edit of a board note this is, and whether it has moved past what a
// writer said it was editing (TASK-103).
//
// The count orders archboard's own writes. It does not replace ADR 0006's byte
// hash: an editor that does not maintain the count carries it across unchanged,
// while the hash still detects that the note's bytes moved.

import fs from 'node:fs';

import type { BoardIdentity } from './board.js';
import { CURRENT_VARIANT, boardDisplayName, boardKey } from './board.js';
import { kept } from './hot.js';
import { readFrontmatterValue, setFrontmatterValue } from './obsidian-md.js';

const FRONTMATTER_VERSION = 'version';
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

type NoteVersion =
  | { kind: 'none' }
  | { kind: 'at'; value: number }
  | { kind: 'foreign'; raw: string };

export type VersionMove = 'unchanged' | 'behind' | 'ahead' | 'unknown';

export type BoardConflictReason = 'changed' | 'unseen';

export interface BoardWriteConflict {
  board: string;
  file: string;
  reason: BoardConflictReason;
  expectedHash?: string;
  actualHash: string;
  lastReadAt?: string;
  fileModifiedAt?: string;
  versionMove: VersionMove;
  expectedVersion?: number;
  actualVersion?: number;
  outcomes: { reload: string; overwrite: string; saveAs: string };
  message: string;
}

export interface BoardVersionConflict {
  board: string;
  file?: string;
  /** What the writer was working from. Null means it last saw no note version. */
  expected: number | null;
  actual: number | null;
  /** How many writes the board moved. Negative means the note went backwards. */
  movedBy: number;
  message: string;
}

export type StatedVersionResult =
  | { ok: true; expected?: number | null }
  | { ok: false; problem: string };

function noteVersion(content: string): NoteVersion {
  const raw = readFrontmatterValue(content, FRONTMATTER_VERSION);
  if (raw === undefined) return { kind: 'none' };
  if (!/^\d+$/.test(raw.trim())) return { kind: 'foreign', raw };
  return { kind: 'at', value: Number(raw.trim()) };
}

/** The count a note carries, or null when it carries none archboard can read. */
export function versionNumber(content: string): number | null {
  const version = noteVersion(content);
  return version.kind === 'at' ? version.value : null;
}

/** Read only the note head because the frontmatter precedes a possibly large scene. */
export function versionOfNoteAt(file: string): number | null {
  try {
    const handle = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(FRONTMATTER_PROBE_BYTES);
      const read = fs.readSync(handle, buffer, 0, buffer.length, 0);
      return versionNumber(buffer.subarray(0, read).toString('utf-8'));
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    return null;
  }
}

/** Which way a note's count moved since archboard last wrote it. */
export function versionMove(baseline: number | null | undefined, now: number | null): VersionMove {
  if (baseline === null || baseline === undefined || now === null) return 'unknown';
  if (now === baseline) return 'unchanged';
  return now > baseline ? 'ahead' : 'behind';
}

/** The sentence shared by the write refusal and the pane's changed-note mark. */
export function describeVersionMove(
  move: VersionMove,
  baseline?: number | null,
  now?: number | null
): string {
  switch (move) {
    case 'unchanged':
      return `The note is still marked version ${now}, which archboard also wrote, so whatever wrote it ` +
        'does not keep that mark — Obsidian, a sync client or a text editor.';
    case 'behind':
      return `The note has gone back to version ${now} from ${baseline}, so it was reverted or an older ` +
        'copy of it was restored rather than edited.';
    case 'ahead':
      return `The note is at version ${now} and archboard last wrote ${baseline}, so another archboard ` +
        `wrote it ${(now ?? 0) - (baseline ?? 0)} time(s) since.`;
    case 'unknown':
      return 'Neither side carries a version archboard can order by, so which of the two is newer cannot ' +
        'be said from the note alone.';
  }
}

const clock = (iso: string | undefined): string =>
  iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'unknown';

function suggestSaveAsName(identity: Pick<BoardIdentity, 'board' | 'variant' | 'displayName'>): string {
  const suffix = identity.variant === CURRENT_VARIANT ? 'from-canvas' : `${identity.variant}-from-canvas`;
  return `${boardDisplayName(identity)}@${suffix}`;
}

export function describeWriteConflict(input: {
  target: BoardIdentity;
  file: string;
  reason: BoardConflictReason;
  expectedHash?: string;
  actualHash: string;
  lastReadAt?: string;
  fileModifiedAt?: string;
  expectedVersion?: number | null;
  actualVersion?: number | null;
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
  const move = versionMove(input.expectedVersion, input.actualVersion ?? null);
  const message = [
    lead,
    describeVersionMove(move, input.expectedVersion, input.actualVersion),
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
    versionMove: move,
    ...(typeof input.expectedVersion === 'number' ? { expectedVersion: input.expectedVersion } : {}),
    ...(typeof input.actualVersion === 'number' ? { actualVersion: input.actualVersion } : {}),
    outcomes,
    message
  };
}

export function describeVersionConflict(input: {
  board: string;
  file?: string;
  expected: number | null;
  actual: number | null;
}): BoardVersionConflict {
  const { board, expected, actual } = input;
  const from = expected === null ? 'a board with no note yet' : `version ${expected}`;
  const now = actual === null ? 'the note carries no version archboard can read' : `the board is at ${actual}`;
  const moved = (actual ?? 0) - (expected ?? 0);
  const since = actual !== null && expected !== null && actual > expected
    ? `Another writer has been here ${actual - expected} time(s) since the version you were working from.`
    : actual !== null && expected !== null
      ? 'The note is behind the version you were working from, so it was reverted or an older copy was restored.'
      : actual === null
        ? 'A note archboard has never written carries no version, so this board is not the one you read.'
        : 'This board had no note when you last saw it and has one now, so somebody has written it since.';
  return {
    board,
    ...(input.file ? { file: input.file } : {}),
    expected,
    actual,
    movedBy: moved,
    message: [
      `Refusing to write "${board}": you were working from ${from}, and ${now}. Nothing was written.`,
      since,
      'Use the document in this refusal before writing over what they did rather than repeating this write ' +
      'against whatever is there now. This refusal is the only one you get: your next write goes against ' +
      'the version named above.'
    ].join('\n')
  };
}

/**
 * Stamp a rendered note as one edit, unless it is byte-identical to the note
 * already at the destination. A foreign `version` property is preserved.
 */
export function stampBoardVersion(
  rendered: { note: string; bytes: Buffer },
  destination: Buffer | undefined
): { note: string; bytes: Buffer; version: number | null } {
  const current = destination ? noteVersion(destination.toString('utf-8')) : { kind: 'none' as const };
  if (current.kind === 'foreign') return { ...rendered, version: null };
  if (destination && rendered.bytes.equals(destination)) {
    return { ...rendered, version: current.kind === 'at' ? current.value : null };
  }
  const next = (current.kind === 'at' ? current.value : 0) + 1;
  const note = setFrontmatterValue(rendered.note, FRONTMATTER_VERSION, String(next));
  return { note, bytes: Buffer.from(note, 'utf-8'), version: next };
}

/** Parse the request source. A person's change is never version-checked. */
export function statedVersion(raw: unknown, writer: 'human' | 'agent'): StatedVersionResult {
  if (writer !== 'agent') return { ok: true };
  if (raw === undefined || raw === '') return { ok: true };
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
    return {
      ok: false,
      problem:
        '`expectVersion` must be a whole number: the version you were editing, as the last write\'s ' +
        `fingerprint reported it or as \`board info\` says. Got ${JSON.stringify(raw)}.`
    };
  }
  const stated = Number(raw.trim());
  return { ok: true, expected: stated === 0 ? null : stated };
}

function rememberedVersions(): Map<string, number | null> {
  return kept('board-version-remembered', () => new Map<string, number | null>());
}

export function rememberedVersion(writer: string | undefined): number | null | undefined {
  return writer ? rememberedVersions().get(writer) : undefined;
}

export function rememberVersion(writer: string, version: number | null): void {
  rememberedVersions().set(writer, version);
}

export function forgetRememberedVersion(writer: string): void {
  rememberedVersions().delete(writer);
}

export function forgetRememberedVersions(prefix: string): void {
  for (const writer of rememberedVersions().keys()) {
    if (writer.startsWith(prefix)) rememberedVersions().delete(writer);
  }
}

/** Stated wins over remembered. The note's current number is not a source. */
export function expectedVersion(input: {
  stated?: number | null;
  rememberedBy?: string;
}): number | null | undefined {
  return input.stated !== undefined ? input.stated : rememberedVersion(input.rememberedBy);
}

/**
 * Check one write while its caller holds the board lock. Reading remembered
 * state here means a preceding waiter can update it before this write checks.
 */
export function checkBoardVersion(input: {
  board: string;
  file?: string;
  writesNote: boolean;
  stated?: number | null;
  rememberedBy?: string;
}): BoardVersionConflict | null {
  if (!input.writesNote) return null;
  const expected = expectedVersion(input);
  if (expected === undefined) return null;
  const actual = input.file ? versionOfNoteAt(input.file) : null;
  if (actual === expected) return null;
  if (input.rememberedBy) rememberVersion(input.rememberedBy, actual);
  return describeVersionConflict({
    board: input.board,
    ...(input.file ? { file: input.file } : {}),
    expected,
    actual
  });
}

/** Record the current note version as something this writer has just been told. */
export function rememberVersionAt(writer: string, file?: string): number | null {
  const version = file ? versionOfNoteAt(file) : null;
  rememberVersion(writer, version);
  return version;
}
