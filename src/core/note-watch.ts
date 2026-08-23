// A note somebody else has written, noticed before anybody writes to it
// (TASK-062).
//
// THE STATE THIS IS ABOUT, AND THE TWO IT IS NOT. A pane shows a board. Under
// ADR 0015 the note is that board, and archboard's own writers are excluded
// from each other by the lock (ADR 0016) — but the lock is not a lock to
// Obsidian, to a sync client, or to a text editor, and ADR 0016 says so. When
// one of those writes the note, the pane goes on showing the board as archboard
// last wrote it, with nothing on screen to say that the vault no longer holds
// it. ADR 0006 catches that, and catches it at the moment of the next write,
// which is the moment after somebody has spent an hour drawing on it.
//
//   a hold      archboard tried to write and was refused, and the board has
//               stopped saving. Something happened. src/core/board-hold.ts
//   a lock      another archboard writer has the board right now.
//               src/core/board-lock.ts
//   this        nobody has tried to write yet, so nothing has been refused, and
//               the note is nevertheless not the one this pane is showing
//
// The three are stages of one story, and the order matters: this comes first,
// and a hold is what it turns into if the human keeps drawing. So a held board
// is not reported here — it has already been said, with more in it.
//
// HOW IT KNOWS. `foreignWriteTo` in board-io, which is the same comparison the
// refusal makes. That is deliberate and it is the whole claim the mark makes:
// what is on screen is the state in which the next write would be refused, not
// a second guess at it.
//
// IT IS NOT A NEW POLL. The lock watcher already sweeps the boards on screen
// once per renewal interval, and only while a browser is connected, because a
// canvas nobody is looking at has nobody to tell (TASK-080). That is exactly
// this question's beat and exactly this question's gate, so this rides on it
// through `onBoardSweep` rather than starting a second timer over the same
// list.
//
// AND IT HASHES ALMOST NOTHING. A note is only read when its size or its
// modification time has moved, or when archboard's own baseline for it has —
// the second one because taking the note (`board open --reload`) changes what
// the comparison is against without touching the file, and a gate that watched
// only the file would leave the mark up after the thing that clears it.

import fs from 'node:fs';

import { holdOn } from './board-hold.js';
import { ForeignWrite, foreignWriteTo } from './board-io.js';
import { boards } from './board-store.js';
import { normalizeBoardKey } from './board.js';
import { VersionMove, describeVersionMove } from './board-version.js';
import { kept } from './hot.js';

/**
 * A board whose note has been written by something that is not archboard.
 *
 * What goes to a pane. The hashes stay behind: a person is being told that
 * their board is not the one in the vault, and no answer they can give involves
 * a sha-256.
 */
export interface NoteWrittenElsewhere {
  board: string;
  file: string;
  /**
   * `changed` — archboard had read these bytes and they are different now.
   * `unseen` — there is a note at this path archboard has never read, so it
   * cannot say what writing over it would delete.
   */
  reason: 'changed' | 'unseen';
  /** When the note was last written, from the filesystem. */
  writtenAt: string;
  /** When archboard last read it. Absent when it never has. */
  lastReadAt?: string;
  /**
   * Which side is newer, which is the question this mark exists to answer and
   * could not (TASK-091). The mark used to be able to say only that the note is
   * not the one on screen. `ahead` is another archboard and this pane is behind
   * it; `unchanged` is an editor that keeps no version, so the note is newer but
   * by an unknown amount; `behind` is the note having been reverted under a
   * pane holding the later work.
   */
  versionMove: VersionMove;
  /** What archboard last wrote there, and what the note carries now. */
  version: number | null;
  ourVersion: number | null;
  message: string;
}

/** Where this news goes: set once, by the server, to the thing that tells the panes. */
type NoteSink = (board: string, written: NoteWrittenElsewhere | null) => void;

interface Looked {
  /** What the gate saw last time, so a note is not re-read for nothing. */
  file: string;
  mtimeMs: number;
  size: number;
  baselineHash: string;
  answer: NoteWrittenElsewhere | null;
}

// Both in kept(), because a hot reload must not make the canvas forget what it
// has already said: re-announcing a mark that is already up is a message every
// pane has, and forgetting one that is up is a mark that never comes down
// (src/core/hot.ts).
const looks = () => kept('note-watch:looks', () => new Map<string, Looked>());
const announced = () => kept('note-watch:announced', () => new Map<string, string | null>());
const sinkHolder = () => kept('note-watch:sink', () => ({ notify: null as NoteSink | null }));

/**
 * Who wrote this note last, if it was not archboard.
 *
 * The answer to send a pane, and the whole of what this module knows. Null for
 * a board whose note is the one archboard last wrote, for a board with no note
 * yet, and for a board that has stopped saving — that last one because the hold
 * is this state one step further on and says more about it.
 */
export function noteWrittenElsewhere(board: string): NoteWrittenElsewhere | null {
  const key = normalizeBoardKey(board);
  const state = boards.get(key);
  if (!state?.file) return null;
  if (holdOn(key)) return null;

  const file = state.file;
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(file);
  } catch {
    // Not there is not somebody else's work; it is a board nobody has written
    // yet, and the next write creates it. The same answer the refusal gives.
    looks().delete(key);
    return null;
  }

  // The baseline is half of the comparison, so it is half of the gate.
  const baselineHash = baselineHashFor(file);
  const seen = looks().get(key);
  if (
    seen &&
    seen.file === file &&
    seen.mtimeMs === stat.mtimeMs &&
    seen.size === stat.size &&
    seen.baselineHash === baselineHash
  ) {
    return seen.answer;
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    looks().delete(key);
    return null;
  }
  const answer = describe(key, foreignWriteTo(file, bytes));
  looks().set(key, { file, mtimeMs: stat.mtimeMs, size: stat.size, baselineHash, answer });
  return answer;
}

/**
 * Look, and tell the panes if the answer has moved.
 *
 * What the sweep calls. On transitions only: a mark that arrived once is a
 * mark, and a mark re-sent every second is a message the socket carries a
 * thousand times an hour for nothing.
 */
export function refreshNoteWatch(board: string): void {
  const key = normalizeBoardKey(board);
  const written = noteWrittenElsewhere(key);
  // The stamp rather than the object, so that a note written twice by another
  // editor is two pieces of news and the same note looked at twice is one.
  const stamp = written === null ? null : `${written.reason}:${written.writtenAt}:${written.version ?? '-'}`;
  const before = announced();
  if (before.has(key) && before.get(key) === stamp) return;
  before.set(key, stamp);
  sinkHolder().notify?.(key, written);
}

/**
 * Where the news goes. A sink rather than an import for the reason the lock has
 * one: this module must not know what a pane is, and a check must be able to
 * watch without standing a browser up.
 */
export function onNoteWrittenElsewhere(sink: NoteSink | null): void {
  sinkHolder().notify = sink;
}

/** Forget what has been looked at and said. For a check that wants a clean process. */
export function forgetNoteWatch(): void {
  looks().clear();
  announced().clear();
}

function baselineHashFor(file: string): string {
  let best: { hash: string; at: string } | null = null;
  for (const board of boards.values()) {
    const baseline = board.baseline;
    if (!baseline || baseline.file !== file) continue;
    if (!best || baseline.at > best.at) best = baseline;
  }
  return best?.hash ?? '';
}

/**
 * The facts, in the words somebody at the canvas would use.
 *
 * It does not offer the three outcomes. Two of them are not reachable from
 * here: nothing has been refused, so there is nothing held to overwrite with
 * and nothing to save elsewhere. What is true is that the note is not this
 * board, and that taking it costs the canvas. The rest is ADR 0006's advice,
 * which is worth repeating wherever this state is displayed because it is the
 * only thing that prevents it.
 */
function describe(board: string, foreign: ForeignWrite | null): NoteWrittenElsewhere | null {
  if (!foreign) return null;
  const lead = foreign.reason === 'changed'
    ? `${foreign.file} has been written by something other than archboard since archboard last wrote it, ` +
      'so this pane is showing a board the vault no longer holds.'
    : `There is a note at ${foreign.file} that archboard has never read, ` +
      'so it cannot say what this board would replace.';
  return {
    board,
    file: foreign.file,
    reason: foreign.reason,
    writtenAt: foreign.fileModifiedAt,
    ...(foreign.lastReadAt ? { lastReadAt: foreign.lastReadAt } : {}),
    versionMove: foreign.versionMove,
    version: foreign.actualVersion,
    ourVersion: foreign.expectedVersion,
    message: [
      lead,
      // Which side is newer, from the same comparison the refusal makes, so the
      // mark and the refusal say one thing (TASK-091).
      describeVersionMove(foreign.versionMove, foreign.expectedVersion, foreign.actualVersion),
      'Nothing has been written and nothing is lost: the next change to this board will be refused ' +
      'rather than saved over theirs.',
      `Take the note with \`board open ${board} --reload\`, which discards what is on this canvas, ` +
      'or carry on drawing and choose when you are asked.',
      'Keep a board open in one editor at a time.'
    ].join('\n')
  };
}
