// Asking for a reload, rather than causing one by saving a file.
//
// `bun --hot` reloads when a watched file changes, and a file changes when
// somebody hits save, which is not a moment anyone chooses. Under the old
// `bun --hot src/server.ts` every keystroke that reached disk re-evaluated the
// entire module graph inside a process holding unsaved boards and open
// sockets. The blast radius was every module with an evaluation-time side
// effect, on every save, whether or not the save had anything to do with them.
//
// The trigger is narrowed to one file nobody edits. `src/dev-canvas.ts` is the
// entry bun watches, and it re-imports the canvas only when the generation in
// this token has moved. An ordinary save still re-evaluates the entry, because
// bun gives no way to stop that, but the entry does nothing, so the canvas is
// untouched. A reload happens when `archboard reload` writes a new generation
// here, and at no other time.
//
// The token lives in the state directory rather than in the repo, so a dev
// session never shows up in `git status`, and it is keyed by port so two
// canvases cannot reload each other.

import fs from 'fs';
import path from 'path';
import { stateDir } from './state-dir.js';
import { kept } from './hot.js';

/** Set by the dev entry once it is watching a token. Nothing else arms it. */
const arming = kept('reload-token', () => ({ file: null as string | null }));

export function reloadTokenPath(port: number): string {
  return path.join(stateDir(), `reload-${port}.ts`);
}

/**
 * Create the token if it is missing and start watching it.
 *
 * Called by the dev entry, and by nothing else: a canvas started any other way
 * has no token, so `POST /api/reload` refuses rather than writing a file
 * nothing is watching.
 */
export function armReloadToken(port: number): string {
  const file = reloadTokenPath(port);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, 'export const generation = 0;\n', 'utf-8');
  arming.file = file;
  return file;
}

export function reloadIsAskable(): boolean {
  return arming.file !== null;
}

/**
 * Ask for a reload by moving the generation on.
 *
 * The write is the whole mechanism: bun is watching this file, sees new bytes,
 * and re-evaluates the entry, which reads the new generation and re-imports
 * the canvas. Returns the generation asked for, so the caller can say what it
 * asked for rather than that it asked.
 */
export function askForReload(): number {
  if (!arming.file) {
    throw new Error(
      'This canvas cannot reload: it was not started with `bun run dev:canvas`. ' +
      'A canvas started with `archboard start` watches nothing on purpose (ADR 0014).'
    );
  }
  const next = readGeneration(arming.file) + 1;
  fs.writeFileSync(arming.file, `export const generation = ${next};\n`, 'utf-8');
  return next;
}

/** Forget the token, so a canvas that stops asking cannot be asked. */
export function disarmReloadToken(): void {
  arming.file = null;
}

function readGeneration(file: string): number {
  try {
    const match = /generation\s*=\s*(-?\d+)/.exec(fs.readFileSync(file, 'utf-8'));
    return match ? parseInt(match[1]!, 10) : 0;
  } catch {
    return 0;
  }
}
