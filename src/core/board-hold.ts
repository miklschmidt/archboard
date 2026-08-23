// A board that has stopped saving, and everything drawn on it since.
//
// ADR 0006 refuses a write to a note that changed underneath, because that
// note holds somebody else's work. ADR 0015 made every gesture a write, so the
// refusal that used to arrive when a person ran `board save` now arrives about
// 400 ms after they lift their finger. Nobody asked for it, and its best offer
// is "discard what you just drew".
//
// So the refusal stops there. The board is put on hold: nothing more is
// written to its note, the drawing carries on into the copy below, and the
// three outcomes ADR 0006 offers wait until somebody asks for them. Archboard
// still picks none of them.
//
// WHY THE COPY IS HERE AND NOT IN THE PANE. The three outcomes only mean what
// ADR 0006 says they mean if the thing they act on is one board that
// every surface can see. Overwrite has to write what the human is looking at,
// not the delta of one gesture; save-elsewhere has to carry the same thing to
// another note; and `board save --board x --force` typed into a terminal has
// to do the same as the button. A copy that lived in the browser would leave
// the CLI writing the other editor's note back over itself.
//
// WHY THIS IS NOT A SECOND TRUTH (ADR 0015). While a board is held, its note
// is not a copy of it — the note is the other editor's board, and this is
// archboard's. There is exactly one answer to "what is on this board" at any
// moment, and `readBoardContent` gives it: the held copy while the hold lasts,
// the note before and after. What ADR 0015 forbids is two answers, and a hold
// is the one situation where the note has stopped being an answer at all.
//
// THE COST, SAID OUT LOUD. A held copy lives in this process. The canvas
// crashing or being restarted loses whatever was drawn since the hold began —
// which is why the pane marks it continuously rather than mentioning it once,
// and why the mark says what it is waiting for.

import { kept } from './hot.js';
import type { BoardContent } from './board-io.js';
import type { BoardWriteConflict } from './board-version.js';

export interface BoardHold {
  /** The refusal that started it, three outcomes and all (ADR 0006). */
  conflict: BoardWriteConflict;
  /** When the board stopped saving. */
  since: string;
  /** How many writes have gone into the copy instead of the note since. */
  writes: number;
  /**
   * The board. Not the note, which now holds somebody else's, and not a queue
   * of deltas: a queue would have to be replayed onto a scene it was never
   * computed against, and every outcome below wants one document to act on.
   *
   * It starts as the board as the refused request found it — which is the
   * other editor's note, because that is all the canvas can read — and is
   * replaced wholesale the moment a pane showing the board says what is on its
   * screen (`fullReport` in the change route). That full report makes overwrite
   * mean "what you are looking at" rather than "their note plus your last
   * gesture". A board no pane is showing has no screen to take, so its held
   * copy stays their note plus whatever an agent has drawn since, and the
   * answers say so.
   */
  content: BoardContent;
  /**
   * Has a pane holding this board said what is on its screen since the hold
   * began? Until it has, the held copy is not what anybody is looking at, and
   * an answer that promised otherwise would be promising the wrong document.
   */
  fromScreen?: boolean;
}

// Keyed by board address. In kept() because a hot reload rebuilds module scope
// and this is the only copy of work a person can see in the scene — exactly
// what kept() is for (ADR 0014).
const holds = kept('board-holds', () => new Map<string, BoardHold>());

export function holdOn(key: string): BoardHold | undefined {
  return holds.get(key);
}

export function isHeld(key: string): boolean {
  return holds.has(key);
}

/** Whether an ordinary write reaches the note rather than the held copy. */
export function writesBoardNote(key: string): boolean {
  return !isHeld(key);
}

/**
 * Stop saving this board, and keep drawing.
 *
 * Called by the write that was refused, after it has refused: the refusal is
 * still thrown, so the caller that tripped it is told nothing happened. A
 * second refusal on a board already held leaves the first conflict in place —
 * it is the one that describes when the board stopped saving, and the human is
 * being asked to choose about that.
 */
export function beginHold(key: string, conflict: BoardWriteConflict, content: BoardContent): BoardHold {
  const existing = holds.get(key);
  if (existing) return existing;
  const hold: BoardHold = { conflict, since: new Date().toISOString(), writes: 0, content };
  holds.set(key, hold);
  return hold;
}

/** Take a write into the held copy rather than into the note. */
export function holdWrite(key: string, content: BoardContent, fromScreen = false): BoardHold | undefined {
  const hold = holds.get(key);
  if (!hold) return undefined;
  hold.content = content;
  hold.writes += 1;
  if (fromScreen) hold.fromScreen = true;
  return hold;
}

/**
 * The board is saving again, because somebody chose one of the three outcomes.
 *
 * Every one of them ends here and each has already decided what the held copy
 * was worth: reload threw it away, overwrite wrote it over the note,
 * save-elsewhere wrote it to another one. Nothing chooses on its own.
 */
export function releaseHold(key: string): BoardHold | undefined {
  const hold = holds.get(key);
  holds.delete(key);
  return hold;
}

/** Every board this canvas has stopped saving, for an answer that lists them. */
export function heldBoardKeys(): string[] {
  return Array.from(holds.keys()).sort();
}

/**
 * A hold as a caller is told about it: what happened, since when, how much is
 * riding on it, and the three ways out — the same three, worded the same way,
 * whether they arrive in a browser, a terminal or an MCP client.
 */
export interface HoldReport {
  board: string;
  since: string;
  /** How many writes have landed in the held copy rather than in the note. */
  writes: number;
  /** Whether a pane has said what is on its screen since the hold began. */
  fromScreen: boolean;
  conflict: BoardWriteConflict;
  message: string;
}

export function reportHold(key: string, hold: BoardHold): HoldReport {
  return {
    board: key,
    since: hold.since,
    writes: hold.writes,
    fromScreen: hold.fromScreen === true,
    conflict: hold.conflict,
    message: holdMessage(key, hold)
  };
}

const clock = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toTimeString().slice(0, 8);
};

/**
 * What to say about a held board, wherever it is said.
 *
 * Three jobs and no more: this board is not being written down, nothing has
 * been lost, and here are the three things that end it — in the same three
 * lines and the same order the refusal itself uses, because a person who has
 * seen one has seen the other.
 */
export function holdMessage(key: string, hold: BoardHold): string {
  const outcomes = hold.conflict.outcomes;
  const drawn = hold.writes === 0
    ? 'Nothing has been drawn on it since.'
    : `${hold.writes} change${hold.writes === 1 ? '' : 's'} since then ${hold.writes === 1 ? 'is' : 'are'} held on the canvas and ${hold.writes === 1 ? 'is' : 'are'} in nothing else.`;
  return [
    `"${key}" stopped saving at ${clock(hold.since)}: ${hold.conflict.file} changed underneath, ` +
    'so writing to it would delete somebody else\'s work (ADR 0006).',
    `${drawn} The note still holds their version, and nothing more is written until you pick one:`,
    `  reload     take the note, discard the canvas   ->  ${outcomes.reload}`,
    `  overwrite  keep the canvas, discard the note   ->  ${outcomes.overwrite}`,
    `  elsewhere  keep both, under another name       ->  ${outcomes.saveAs}`,
    'Keep a board open in one editor at a time.'
  ].join('\n');
}
