import { parseArgs } from '../args.js';
import { printJson } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { getSelection } from '../../core/canvas-client.js';

// Read what a human currently has picked on the board.
//
// This does not require a browser round-trip: the browser pushes selection to
// the server on change, so reading it is a plain server read that never
// re-transmits the scene.
export async function selection(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, {
    text: { takesValue: false }
  });

  await ensureCanvasRunning();
  const report = await getSelection();

  if (flags.text) {
    process.stdout.write(report.text + '\n');
    return;
  }

  const { success, text, ...rest } = report;
  printJson(rest);
}
