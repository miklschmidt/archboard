// Is this canvas running the source and the bundle that are on disk now?
//
// Nothing used to answer that, and the answer is not obvious from anywhere
// else, because a stale process has no symptom of its own: every command still
// works and every answer is right for the copy that produced it. Under ADR 0014
// there are three copies of the program with three different lifetimes, and
// only one of them is always current:
//
//   the CLI        a fresh process per command, so it always has your edit
//   the canvas     read its source once, at start or at the last reload
//   a browser tab  loaded a built bundle once, when the tab was opened
//
// Two commands disagreeing about one board is what that looks like from the
// outside, and it has been diagnosed wrongly more than once (TASK-056).
//
// The two halves are measured differently because they are made differently.
// The canvas runs TypeScript directly, so the question is whether any file it
// loaded has been written since it loaded it. The tab runs a vite build, so the
// question is whether the bundle it fetched is still the bundle on disk.

import fs from 'fs';
import path from 'path';

// When this module graph was last evaluated. Module scope on purpose, and the
// one thing in the canvas that must NOT go in kept(): `bun --hot` re-evaluates
// every module in the graph, so a reload moves this forward, and that is the
// whole point. After a reload the canvas really is running the source as of
// that moment, and the warning has to clear by itself.
const evaluatedAt = Date.now();

// Every source file this evaluation has been seen to load. Accumulated rather
// than read fresh each time, because bun's registry is not a stable list under
// `bun --hot`: re-evaluating the watched entry drops the canvas's own modules
// out of it, and a canvas whose module list had just collapsed to one file
// would report itself current at the exact moment it had gone behind. Measured,
// not assumed — docs/design/hot-reload-under-bun.md.
//
// Emptied by a reload along with the rest of module scope, which is correct:
// after a reload the graph is re-imported and repopulates it.
const loaded = new Set<string>(); // hot-safe: a cache of which files this evaluation loaded, refilled from the module registry on the next call, and stale by definition after a reload

const srcDir = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '..', '..');

export interface SourceState {
  /** When the canvas last read its source: process start, or the last reload. */
  evaluatedAt: string;
  /** The file that has been written most recently, relative to the repo root. */
  newestFile: string | null;
  newestAt: string | null;
  /** True when that write happened after the canvas read its source. */
  stale: boolean;
}

/**
 * Which files this process actually loaded, and whether any has changed since.
 *
 * The file list comes from bun's own module registry rather than from a walk of
 * the import graph. That is the difference between what this process is running
 * and what a reader of the source thinks it would run, and only the first one
 * can answer the question. It also cannot drift: a module added tomorrow is in
 * the registry the moment something imports it.
 *
 * Everything outside `src/` is dropped. Editing a dependency is not a thing
 * this is about, and a change under `dist/` is the other half, below.
 */
export function sourceState(): SourceState {
  let newestFile: string | null = null;
  let newestMs = 0;
  for (const file of loadedSourceFiles()) {
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      // A file that has been deleted under a running canvas is not something
      // this can report usefully, and it must not throw in a health check.
      continue;
    }
    if (mtimeMs > newestMs) {
      newestMs = mtimeMs;
      newestFile = file;
    }
  }
  return {
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    newestFile: newestFile === null ? null : path.relative(repoRoot, newestFile),
    newestAt: newestFile === null ? null : new Date(newestMs).toISOString(),
    // Strictly after, so a file written in the same millisecond as the
    // evaluation that read it is not called stale.
    stale: newestMs > evaluatedAt
  };
}

function loadedSourceFiles(): string[] {
  const registry = moduleRegistry();
  const prefix = srcDir + path.sep;
  for (const file of Object.keys(registry ?? {})) {
    if (file.startsWith(prefix) && file.endsWith('.ts')) loaded.add(file);
  }
  return [...loaded];
}

/**
 * bun keeps `require.cache` populated for ESM imports too, so this is the list
 * of modules the process has evaluated. Guarded because it is bun's behaviour
 * rather than a specification: under a runtime that does not do this the list
 * is empty and nothing is ever reported stale, which is the safe way to be
 * wrong.
 */
function moduleRegistry(): Record<string, unknown> | null {
  const host = globalThis as { require?: { cache?: Record<string, unknown> } };
  const cache = typeof require !== 'undefined' ? require.cache : host.require?.cache;
  return cache ?? null;
}

// ─── The tab's half ───────────────────────────────────────────
//
// A tab is not stale because time passed; it is stale because somebody rebuilt
// the frontend under it. What identifies a build is the entry script vite names
// in `dist/frontend/index.html`, because that name carries a hash of the
// content. Two tabs on the same bytes name the same file, and a rebuild that
// changed nothing is not a difference anybody has to hear about.

export interface FrontendState {
  /** The entry script the built bundle names now, or null if nothing is built. */
  current: string | null;
  /** The entry script the tab reported loading. */
  loaded: string | null;
  stale: boolean;
  /** What to tell the tab, or null when there is nothing to say. */
  message: string | null;
}

const BUILT_ASSET = /^\/assets\//;

export function frontendBuild(): string | null {
  try {
    const html = fs.readFileSync(path.join(repoRoot, 'dist', 'frontend', 'index.html'), 'utf-8');
    const match = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * What to say to a tab that has told us which bundle it loaded.
 *
 * Silent unless both sides name a built asset and the two names differ. A tab
 * served by the vite dev server names its source file, not a hashed bundle, and
 * a canvas with no `dist/frontend` has nothing to compare against; in both
 * cases the honest answer is nothing at all rather than a guess.
 */
export function frontendState(loaded: string | null | undefined): FrontendState {
  const current = frontendBuild();
  const reported = loaded ?? null;
  const comparable =
    current !== null && reported !== null &&
    BUILT_ASSET.test(current) && BUILT_ASSET.test(reported);
  const stale = comparable && current !== reported;
  return {
    current,
    loaded: reported,
    stale,
    message: stale
      ? `This tab loaded ${reported} and the canvas is serving ${current}. ` +
        'The frontend has been rebuilt since this tab opened, so it is running older code. ' +
        'Reload the tab.'
      : null
  };
}
