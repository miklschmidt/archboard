import { parseArgs } from '../args.js';
import { printJson, note } from '../util.js';
import { ensureCanvasRunning, stopCanvas, canvasPort, isCanvasHealth, foreignServiceError } from '../../core/spawn.js';
import { getHealth, getSyncStatus } from '../../core/canvas-client.js';
import { EXPRESS_SERVER_URL } from '../../core/config.js';
import { readPidFile } from '../../core/pidfile.js';

export async function start(argv: string[]): Promise<void> {
  parseArgs(argv, {});

  // Explicit start is user intent — it overrides the auto-start opt-outs
  const result = await ensureCanvasRunning({ force: true });
  if (!result.spawned) {
    note(`Canvas server already running at ${result.url}`);
  }
  printJson({
    running: true,
    url: result.url,
    spawned: result.spawned,
    pid: readPidFile(canvasPort()) ?? undefined
  });
}

export async function stop(argv: string[]): Promise<void> {
  parseArgs(argv, {});
  const result = await stopCanvas();
  printJson(result);
}

// Reload the canvas in place, rather than restarting it.
//
// A restart drops every unsaved board, which is the one thing this tool
// collects and cannot recompute. A reload keeps the port, the sockets, the
// boards, the panes and the change feed's cursor, and re-runs the source.
//
// It is a command rather than a file-save trigger on purpose (ADR 0014): a
// reload re-evaluates every module in the graph inside a live process, so the
// moment it happens should be one somebody picked.

export async function status(argv: string[]): Promise<void> {
  parseArgs(argv, {});

  let health;
  try {
    health = await getHealth();
  } catch {
    printJson({ running: false, url: EXPRESS_SERVER_URL });
    const error = new Error(`Canvas server is not running at ${EXPRESS_SERVER_URL}`);
    (error as any).code = 'CANVAS_UNREACHABLE';
    (error as any).quiet = true; // JSON above already tells the story
    throw error;
  }

  if (!isCanvasHealth(health)) {
    printJson({
      running: false,
      url: EXPRESS_SERVER_URL,
      conflict: 'another service (or a pre-1.1 canvas build) is answering at this URL'
    });
    const error = foreignServiceError();
    (error as any).quiet = true;
    throw error;
  }

  let sync: Record<string, unknown> = {};
  try {
    sync = await getSyncStatus();
  } catch { /* health is enough */ }

  const stale = staleSource(health);

  printJson({
    running: true,
    url: EXPRESS_SERVER_URL,
    // Prefer the pid the server reports about itself; the pidfile can be stale
    pid: health.pid ?? readPidFile(canvasPort()) ?? undefined,
    elements: health.elements_count,
    browserClients: health.websocket_clients,
    ...(stale ? { stale } : {}),
    ...sync
  });

  // On stderr as well as in the JSON, because this is the answer to a question
  // nobody knew to ask. Somebody running `status` is usually already confused
  // about why an edit had no effect.
  if (stale) note(stale.says);
}

interface StaleSource {
  startedAt: string;
  changedFile: string;
  changedAt: string;
  says: string;
}

/**
 * Is the canvas running code older than the source on disk?
 *
 * The comparison is the server's, because only the server knows which files it
 * loaded and when it read them. This turns the answer into a sentence and picks
 * the remedy: a canvas under `bun run dev:canvas` can re-read its source
 * without losing what is on screen, and one started any other way cannot
 * (ADR 0014), so it is never told to reload when reloading would 409 at it.
 */
function staleSource(health: { source?: { stale: boolean; newestFile: string | null; newestAt: string | null; evaluatedAt: string }; reloadable?: boolean }): StaleSource | null {
  const source = health.source;
  if (!source?.stale || !source.newestFile || !source.newestAt) return null;
  const remedy = health.reloadable
    ? 'Pick it up with `bun run reload`, which keeps every board and pane on screen.'
    : 'Restart it to pick that up: `archboard stop && archboard start`. ' +
      'That drops every unsaved board, so save first.';
  // Clock time, not the ISO stamps the JSON carries: the sentence is read by
  // somebody who is looking at their own terminal wondering why their edit did
  // nothing, and "14:02:11" is the thing they can place.
  const clock = (at: string): string => new Date(at).toLocaleTimeString();
  return {
    startedAt: source.evaluatedAt,
    changedFile: source.newestFile,
    changedAt: source.newestAt,
    says:
      `This canvas read its source at ${clock(source.evaluatedAt)} and ${source.newestFile} ` +
      `changed at ${clock(source.newestAt)}, so it is answering from the older code. ${remedy}`
  };
}
