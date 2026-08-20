// What happens to a caller that names no board.
//
// It is refused. There is no active board to fall back to, no last-opened
// pointer, no environment variable, and no "the pane you were looking at" —
// every one of those is the same mistake, which is a write resolving against
// ambient state that the caller cannot see and did not set. The board is part
// of what you are asking for, so you say it.
//
// This costs a flag on every call and buys the one property worth having: a
// write can never land on a board the caller did not name. A canvas with two
// panes on two boards has no answer to "the board", and inventing one that is
// right most of the time is the failure mode that takes longest to notice.
//
// The refusal has to be usable, not merely correct — a missing board is a
// mistake made at the keyboard, and the moment of the mistake is when the list
// of boards is worth printing. See ADR 0009.

export class BoardRequiredError extends Error {
  readonly code = 'BOARD_REQUIRED';
  readonly status = 400;
  /** The boards this canvas has open, so the caller can pick one from here. */
  readonly open: string[];

  constructor(open: string[], what?: string) {
    super(boardRequiredMessage(open, what));
    this.name = 'BoardRequiredError';
    this.open = open;
  }
}

function boardRequiredMessage(open: string[], what?: string): string {
  const subject = what ? `${what} needs a board` : 'This needs a board';
  const openList = open.length > 0
    ? `Open right now: ${open.join(', ')}.`
    : 'No board is open in this canvas.';
  return (
    `${subject}, and none was named. Nothing was done. ` +
    'Pass one — `--board <key>` on the command line, `?board=<key>` on the API, ' +
    'a `board` argument on an MCP tool. ' +
    `${openList} \`board list\` shows what the vault holds, \`panes\` shows what is on screen. ` +
    'There is no default board on purpose: a board is part of what you are asking for (ADR 0009).'
  );
}

/** Is this the refusal, rather than some other failure? */
export function boardRequiredOf(error: unknown): BoardRequiredError | null {
  return error instanceof BoardRequiredError ? error : null;
}
