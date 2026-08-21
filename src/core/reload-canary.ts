// What a reload is not allowed to change, checked every time one happens.
//
// The static check (`scripts/check-module-scope.mjs`) reads the source and
// refuses the shapes that only work the first time a module is evaluated. It
// will miss things: it knows nothing about types, matches receivers by name,
// and does not follow a dynamic import. This is the other net, and it works
// from the opposite end. It does not read anything. It looks at the live
// process before a reload and again afterwards, and says what moved.
//
// The point is that a broken reload stops being silent. The two bugs TASK-057
// found were an emptied board and a doubled handler, and neither raised
// anything: the canvas went on answering, wrongly, until somebody happened to
// look. Everything below would have caught the first one immediately, and the
// socket count would have caught a dropped tab. A doubled handler is invisible
// to a snapshot of state, which is why the reload check drives real traffic
// through the server afterwards as well.
//
// FACTS ARE READ OUT OF THE KEPT REGISTRY BY NAME, not by importing the
// modules that own them. That is deliberate. This module is evaluated on the
// dev entry's side of the reload boundary, so an import of `board-store.js`
// here would bind to whichever copy happened to be current, which is the
// ambiguity the registry exists to remove (src/core/hot.ts). Reading the
// registry means the canary sees exactly what the running canvas sees.
//
// The cost is that the shapes below are duplicated rather than imported. That
// is a real cost and it is the right one: a canary that shares its idea of the
// truth with the thing it is checking is not a canary.

const REGISTRY = Symbol.for('archboard.kept');

type Registry = Map<string, unknown>;

function registry(): Registry | null {
  const host = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
  return host[REGISTRY] ?? null;
}

function keptValue<T>(name: string): T | null {
  const store = registry();
  if (!store || !store.has(name)) return null;
  return store.get(name) as T;
}

/**
 * What the canvas is holding right now.
 *
 * Every field is something a human can lose: a board is unsaved work, a pane
 * registration is where they put it on the wall, a socket is a tab that thinks
 * it is still connected, and the feed's identity and cursor are what a hook
 * uses to mean "since last turn". Nothing here is derived or recomputable.
 */
export interface ReloadFacts {
  /**
   * Board key to where that board's note is.
   *
   * It used to be the number of elements on the board, which was the right
   * fact while the process was the only place they were: the TASK-057 bug this
   * was built for re-ran `boards.set()` at module scope and replaced an open
   * board with an empty one, and the count went to zero. Board content is in
   * the vault now (ADR 0015), so a count would be a fact about the disk and a
   * reload cannot touch it — the same bug would go unreported.
   *
   * What a reload can still lose is this: which boards this canvas has open and
   * where each one's note is. Lose that and a pane is pointed at a board the
   * canvas cannot find, which is the same loss arriving a moment later. The
   * unguarded `boards.set()` blanks it, so the canary still catches exactly
   * what it was built to catch.
   */
  boards: Record<string, string>;
  /** Client id to the board that pane has been pointed at. */
  paneBoards: Record<string, string>;
  /** Client id to the pane it registered as. */
  panes: Record<string, string>;
  /** Sockets the canvas is holding, open or not. */
  sockets: number;
  /** The change feed's identity, which a cursor is only meaningful within. */
  feedId: string | null;
  /** The cursor a caller starting now would be given. */
  cursor: number | null;
}

/** Read the facts out of the running canvas. */
export function readFacts(): ReloadFacts {
  const boards: Record<string, string> = {};
  const boardMap = keptValue<Map<string, { file?: string }>>('boards');
  if (boardMap) {
    for (const [key, board] of boardMap) boards[key] = board.file ?? 'nowhere';
  }

  const paneBoards: Record<string, string> = {};
  const paneBoardMap = keptValue<Map<string, string>>('pane-boards');
  if (paneBoardMap) {
    for (const [clientId, board] of paneBoardMap) paneBoards[clientId] = board;
  }

  const panes: Record<string, string> = {};
  const paneMap = keptValue<Map<string, { paneId: string }>>('panes');
  if (paneMap) {
    for (const [clientId, pane] of paneMap) panes[clientId] = pane.paneId;
  }

  const socketSet = keptValue<Set<unknown>>('ws-clients');
  const feed = keptValue<{ id: string; cursor: number }>('change-feed');

  return {
    boards,
    paneBoards,
    panes,
    sockets: socketSet ? socketSet.size : 0,
    feedId: feed ? feed.id : null,
    cursor: feed ? feed.cursor : null
  };
}

/**
 * Everything that changed across the reload, in the words of what was lost.
 *
 * An empty array is the only acceptable result. Wording is deliberately about
 * consequences rather than fields, because the person reading it is mid-edit
 * and needs to know whether to stop.
 *
 * The cursor is the one field allowed to move, and only forwards: real work
 * can land on the canvas while a reload is in flight, and a cursor that went
 * up is that, not damage. A cursor that went backwards means the feed was
 * rebuilt, and every saved cursor anywhere now means something else.
 */
export function compareFacts(before: ReloadFacts, after: ReloadFacts): string[] {
  const complaints: string[] = [];

  for (const [key, file] of Object.entries(before.boards)) {
    if (!(key in after.boards)) {
      complaints.push(`board "${key}" is gone, and its note is at ${file}`);
    } else if (after.boards[key] !== file) {
      complaints.push(
        `board "${key}" had its note at ${file} and now has it at ${after.boards[key]}`
      );
    }
  }
  for (const key of Object.keys(after.boards)) {
    if (!(key in before.boards)) complaints.push(`board "${key}" appeared out of nowhere`);
  }

  for (const [clientId, board] of Object.entries(before.paneBoards)) {
    if (!(clientId in after.paneBoards)) {
      complaints.push(`pane ${clientId} lost its board, which was "${board}"`);
    } else if (after.paneBoards[clientId] !== board) {
      complaints.push(`pane ${clientId} was holding "${board}" and now holds "${after.paneBoards[clientId]}"`);
    }
  }

  for (const clientId of Object.keys(before.panes)) {
    if (!(clientId in after.panes)) {
      complaints.push(`pane ${before.panes[clientId]} (${clientId}) is no longer registered`);
    }
  }

  if (after.sockets !== before.sockets) {
    complaints.push(
      `${before.sockets} socket${before.sockets === 1 ? '' : 's'} before the reload, ` +
      `${after.sockets} after: a tab may think it is still connected`
    );
  }

  if (before.feedId !== after.feedId) {
    complaints.push(
      `the change feed is a different feed (${before.feedId} -> ${after.feedId}), ` +
      'so every cursor saved anywhere is now meaningless'
    );
  } else if (before.cursor !== null && after.cursor !== null && after.cursor < before.cursor) {
    complaints.push(`the change feed cursor went backwards, ${before.cursor} -> ${after.cursor}`);
  }

  return complaints;
}

/**
 * Tell the terminal and every open tab that the reload cost something.
 *
 * Both, because they are two different people. The terminal has the developer
 * who caused it and can undo it; the tab has whoever is standing at the board
 * with work that may no longer be there, and they have no terminal. A message
 * on the wall is the only way they find out before they notice by hand.
 *
 * Sending is best-effort by design. This runs because something is already
 * wrong, so a socket that will not take the message must not turn a report
 * into a second failure.
 */
export function reportBrokenReload(complaints: string[]): void {
  const banner = [
    '',
    '  !! THE RELOAD BROKE SOMETHING. The canvas is not what it was.',
    ...complaints.map(line => `     - ${line}`),
    '     Restart the canvas before trusting anything on it.',
    ''
  ].join('\n');
  // console, not the logger: this has to be on screen at its own size, and it
  // must work even if the logger is one of the things the reload broke.
  console.error(banner);

  const sockets = keptValue<Set<{ readyState: number; send: (data: string) => void }>>('ws-clients');
  if (!sockets) return;
  const message = JSON.stringify({ type: 'reload_broken', complaints });
  for (const socket of sockets) {
    try {
      // 1 is WebSocket.OPEN. Compared as a number so this module does not have
      // to import `ws`, which would put a second copy of it on the dev entry's
      // side of the reload boundary.
      if (socket.readyState === 1) socket.send(message);
    } catch {
      // A socket that cannot be told is exactly the kind of damage being
      // reported. The terminal already has it.
    }
  }
}
