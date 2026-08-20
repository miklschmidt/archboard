#!/usr/bin/env bun
// Ask a dev canvas to re-evaluate its source, keeping boards, panes and sockets.
//
// This is a maintainer command, not a user one. It only does anything to a
// canvas started with `bun run dev:canvas`, which means somebody with this
// checkout open and a terminal running it. A consumer of archboard has no
// reason to reach for it and no way to benefit from it, so it stays out of the
// CLI (ADR 0014).
//
//   bun run reload                                  # the canvas on the default URL
//   EXPRESS_SERVER_URL=http://127.0.0.1:39501 bun run reload
//
// Several canvases can be up at once on different ports over different vaults,
// so this names the one it reached rather than leaving you to assume.

import { reloadCanvas } from '../src/core/canvas-client.ts';
import { EXPRESS_SERVER_URL } from '../src/core/config.ts';

try {
  const result = await reloadCanvas();
  console.log(
    `Asked the canvas at ${EXPRESS_SERVER_URL} to reload (generation ${result.generation}, pid ${result.pid}).\n` +
    'Watch that dev terminal: it reports what the reload cost, and says so loudly if it cost anything.'
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not reload the canvas at ${EXPRESS_SERVER_URL}: ${message}`);
  process.exit(1);
}
