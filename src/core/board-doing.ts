// What an agent said it was doing, per board.
//
// A person at the wall sees boxes move. Without this they infer the intent
// afterwards, if they can — which is the connection between a creator and what
// they are creating being broken for one of the two creators on this canvas
// (CLAUDE.md, ADR 0016). So an agent says what it is doing on every write, in
// one line, and the line goes on screen as the write lands.
//
// ── This is not the change feed ───────────────────────────────────
//
// The feed reports what the board BECAME, computed by diffing it against the
// last state anybody was told about. This is what somebody SAID they were
// doing, which is a claim about intent no diff can recover: a move that changes
// nothing nameable still has one, and a line that turns out to be wrong is
// still what was said. Neither is routed through the other.
//
// ── And it is not board content ───────────────────────────────────
//
// It never reaches the note. It is not what is on the board, it is what
// somebody said while changing it, so it dies with the canvas — the same
// carve-out ADR 0015 draws for sockets, panes and what a person has selected.
// The requirement rides as a query parameter for that reason as much as for
// DELETE having no body: a field in an element's body is one careless spread
// away from being persisted.
//
// ── One line, and a few of them ───────────────────────────────────
//
// A list of one-liners is glanceable from two metres away on a 75-inch
// display. A list of paragraphs is a log nobody reads, and a transcript is
// worse. So the line is capped and the list is short, and both caps are here
// rather than in the middleware, the pane and the injector separately.

import { kept } from './hot.js';
import { normalizeBoardKey } from './board.js';
import type { HolderKind } from './board-lock.js';

/**
 * The longest line worth putting on a wall.
 *
 * Not a truncation: a caller that writes past it is refused, because being made
 * to write the sentence is the point and a silently clipped sentence teaches
 * nothing. Long enough for "rerouting orders through the new payment queue",
 * short enough that four of them fit in the corner of a board.
 */
export const DOING_MAX_CHARS = 140;

/** How many are kept per board. The last few actions, not a transcript. */
export const DOING_KEPT = 5;

/** One thing somebody said they were doing, and who said it. */
export interface DoingEntry {
  /** The line itself, as it was written. */
  doing: string;
  /** ISO timestamp of the write it arrived with. */
  at: string;
  /**
   * Whose it is: the lock holder id of the writer.
   *
   * Kept because "whose descriptions are whose" is the question ADR 0005 makes
   * load-bearing, and because two agents on one board otherwise read as one.
   */
  by: string;
  kind: HolderKind;
  /** Was this write part of a claim — a step of a campaign, rather than a lone act? */
  claimed?: boolean;
}

interface Store {
  byBoard: Map<string, DoingEntry[]>;
}

// Kept, so a hot reload does not wipe the last thing an agent said off a wall
// somebody is reading (ADR 0014).
const store = (): Store => kept('board-doing', () => ({ byBoard: new Map<string, DoingEntry[]>() }));

/** A line as it must arrive, or the reason it is refused. */
export type DoingCheck = { ok: true; doing: string } | { ok: false; problem: string };

/**
 * Is this a line, and is it one line?
 *
 * Newlines collapse rather than being refused — a shell heredoc is not a
 * mistake worth a round trip — but length and emptiness are refusals, because
 * both mean the caller has not actually said anything.
 */
export function checkDoing(raw: unknown): DoingCheck {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, problem: 'nothing was said' };
  }
  const doing = raw.replace(/\s+/g, ' ').trim();
  if (doing.length > DOING_MAX_CHARS) {
    return {
      ok: false,
      problem: `${doing.length} characters, and the cap is ${DOING_MAX_CHARS} — this goes on a wall, not into a log`
    };
  }
  return { ok: true, doing };
}

/** Remember what was said, newest last, oldest dropped. */
export function recordDoing(board: string, entry: DoingEntry): DoingEntry[] {
  const key = normalizeBoardKey(board);
  const { byBoard } = store();
  const list = [...(byBoard.get(key) ?? []), entry].slice(-DOING_KEPT);
  byBoard.set(key, list);
  return list;
}

/** The last few things said about this board, oldest first. */
export function recentDoing(board: string): DoingEntry[] {
  return store().byBoard.get(normalizeBoardKey(board)) ?? [];
}

/**
 * Forget a board's lines.
 *
 * Nothing calls this on the ordinary path — the list is meant to outlive the
 * work it describes for as long as somebody might still be looking at the
 * board. It exists for the checks, which run several boards through one canvas.
 */
export function forgetDoing(board?: string): void {
  const { byBoard } = store();
  if (board === undefined) byBoard.clear();
  else byBoard.delete(normalizeBoardKey(board));
}
