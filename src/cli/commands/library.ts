import { parseArgs, CliUsageError } from '../args.js';
import { printJson } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { getLibrary } from '../../core/canvas-client.js';

// What is in the stencil palette.
//
// Read-only, and deliberately so: the library is edited in the browser, where
// the shapes are visible. This exists because the palette lives on the server
// rather than in a browser profile (ADR 0007), which means an agent can be told
// what is available to drag onto a board instead of guessing.

export async function library(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv, { text: { takesValue: false } });
  const [action = 'list'] = positionals;

  if (action !== 'list') throw new CliUsageError('Usage: library list [--text]');

  await ensureCanvasRunning();
  const result = await getLibrary();

  if (!flags.text) {
    printJson({
      count: result.items.length,
      seeded: result.seeded,
      file: result.file,
      vaultBacked: result.vaultBacked,
      // Elements are the bulk of a library and say nothing an agent can use to
      // pick a stencil, so the listing carries what identifies one.
      items: result.items.map(item => ({
        id: item.id,
        name: item.name ?? null,
        // Which curated set it was seeded from, when it was seeded rather than
        // installed. The v1 library format carries no names, so for most of
        // the shipped stencils this is the only thing that identifies them.
        from: result.origins?.[item.id] ?? null,
        elements: item.elements.length
      }))
    });
    return;
  }

  const lines: string[] = [];
  lines.push(
    result.items.length === 0
      ? 'The library is empty.'
      : `${result.items.length} stencils in the library.`
  );
  lines.push(
    result.vaultBacked
      ? `Stored at ${result.file}.`
      : 'Not stored: no vault is configured, so the library lasts as long as this canvas server.'
  );
  if (result.seeded.length > 0) lines.push(`Seeded from: ${result.seeded.join(', ')}.`);
  lines.push('');
  for (const item of result.items) {
    const size = `${item.elements.length} element${item.elements.length === 1 ? '' : 's'}`;
    const from = result.origins?.[item.id] ?? 'installed';
    lines.push(`  ${(item.name ?? '—').padEnd(24)} ${size.padEnd(13)} ${from.padEnd(32)} ${item.id}`);
  }
  console.log(lines.join('\n'));
}
