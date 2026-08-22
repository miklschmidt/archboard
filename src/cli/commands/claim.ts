// Taking a board for longer than one write, and giving it back.
//
// Two commands rather than one with a subcommand, because they are two acts a
// long way apart: everything an agent came to do happens between them. The
// board is the only thing they share, and the board is named on both the way
// every other command names one — which is deliberately the *only* thing that
// travels. A claim lives on the canvas against the board it claimed, so the
// twenty writes in between say nothing about it and cannot forget to.
//
// When to claim is judgement and lives in the skill, not here (ADR 0016): claim
// when the work is substantial and you know that in advance, do not claim to
// move one box. What this file can do is make the cheap thing free — an
// unclaimed write needs none of this — and the expensive thing deliberate.

import { parseArgs, CliUsageError } from '../args.js';
import { printJson, note } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { claimBoard, releaseBoardClaim } from '../../core/canvas-client.js';

export async function claim(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, {
    reason: { takesValue: true },
    for: { takesValue: true }
  });

  const reason = typeof flags.reason === 'string' ? flags.reason.trim() : '';
  if (!reason) {
    throw new CliUsageError(
      'claim needs --reason: it is what the pane shows the person whose board you have taken. ' +
      'Without it the wall has stopped working for no reason they can see. ' +
      'Say what you are taking it for, in their words: --reason "redrawing the payment path". ' +
      'That is the campaign; --doing on each write is the step.'
    );
  }
  const forMs = typeof flags.for === 'string' ? durationMs(flags.for) : undefined;

  await ensureCanvasRunning();
  const result = await claimBoard({ reason, ...(forMs !== undefined ? { forMs } : {}) });

  const until = new Date(result.claim.expires).toTimeString().slice(0, 5);
  note(
    (result.created
      ? `"${result.board}" is yours until ${until}, or until you release it.`
      : `Your claim on "${result.board}" now runs to ${until}.`) +
    ' Every write you make to it goes under the claim, and nobody else writes to it meanwhile.' +
    ' The person at the canvas can take it back at any moment — you will be told, and what you have' +
    ' already written stays. Leave the board sensible after each write, or work on a variant and swap.' +
    ` Release it with \`archboard release --board ${result.board}\`.`
  );
  printJson(result);
}

export async function release(argv: string[]): Promise<void> {
  parseArgs(argv, {});

  await ensureCanvasRunning();
  const result = await releaseBoardClaim();

  note(
    result.released
      ? `"${result.board}" is free. It goes back to being taken one write at a time.`
      : `Nothing to release: "${result.board}" was not claimed here. A claim that ran out, or that ` +
        'somebody took back, has already ended.'
  );
  printJson(result);
}

/**
 * How long, said the way somebody says it out loud.
 *
 * A bare number is refused rather than guessed at. Minutes and seconds are both
 * plausible readings of `--for 30`, they differ by a factor of sixty, and the
 * cost of guessing wrong is a board somebody cannot draw on for half an hour.
 */
function durationMs(said: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h)$/i.exec(said.trim());
  if (!match) {
    throw new CliUsageError(
      `--for takes a duration with a unit: 90s, 10m, 1h. "${said}" has none, and a bare number is ` +
      'as easily minutes as seconds.'
    );
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  return amount * (unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1000);
}
