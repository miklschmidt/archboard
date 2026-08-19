import { parseArgs, CliUsageError } from '../args.js';
import { printJson } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { compareBoardsOnCanvas } from '../../core/canvas-client.js';

// `compare <from> [to]` — the structured semantic diff between two variants.
//
// JSON only, per the CLI convention and per the point of the command: the
// consumer is an agent that will narrate the difference itself, so composing a
// sentence here would be pre-digesting the one thing it is being given. The
// whole diff is printed; nothing is elided for size.
export async function compare(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv, {
    from: { takesValue: true },
    to: { takesValue: true }
  });

  const from = (flags.from as string) ?? positionals[0];
  const to = (flags.to as string) ?? positionals[1];
  if (!from) {
    throw new CliUsageError('compare needs a board: `compare payments payments@option-a`');
  }
  if (positionals.length > 2) {
    throw new CliUsageError('compare takes two boards; pass them one at a time');
  }

  await ensureCanvasRunning();
  printJson(await compareBoardsOnCanvas({ from, ...(to ? { to } : {}) }));
}
