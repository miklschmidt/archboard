import { parseArgs, CliUsageError } from '../args.js';
import { printJson, note } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import {
  listBoardsOnCanvas,
  getCurrentBoard,
  openBoard,
  newBoard,
  saveBoard
} from '../../core/canvas-client.js';

const SUBCOMMANDS = ['list', 'current', 'new', 'open', 'save'] as const;

// Boards are addressed as `name` or `name@variant` — `current` is the variant
// that owns the bare name, because it is the architecture that exists.
const ADDRESS_FLAGS = {
  variant: { takesValue: true },
  level: { takesValue: true }
};

export async function board(argv: string[]): Promise<void> {
  const sub = argv[0];
  if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new CliUsageError(`board needs a subcommand: ${SUBCOMMANDS.join(', ')}`);
  }
  const rest = argv.slice(1);

  await ensureCanvasRunning();

  if (sub === 'list') {
    parseArgs(rest, {});
    const result = await listBoardsOnCanvas();
    printJson({
      success: true,
      vault: result.vault,
      active: result.active,
      boards: result.boards,
      open: result.open
    });
    return;
  }

  if (sub === 'current') {
    parseArgs(rest, {});
    const result = await getCurrentBoard();
    printJson(result);
    return;
  }

  if (sub === 'new') {
    const { positionals, flags } = parseArgs(rest, ADDRESS_FLAGS);
    const name = positionals[0];
    if (!name) throw new CliUsageError('board new needs a name');
    const result = await newBoard({
      board: name,
      ...(flags.variant ? { variant: flags.variant as string } : {}),
      ...(flags.level ? { level: flags.level as string } : {})
    });
    note(`Board "${result.board}" is empty and exists only in memory until you run \`board save\`.`);
    printJson(result);
    return;
  }

  if (sub === 'open') {
    const { positionals, flags } = parseArgs(rest, { ...ADDRESS_FLAGS, reload: { takesValue: false } });
    const name = positionals[0];
    if (!name) throw new CliUsageError('board open needs a board name');
    const result = await openBoard({
      board: name,
      ...(flags.variant ? { variant: flags.variant as string } : {}),
      ...(flags.level ? { level: flags.level as string } : {}),
      ...(flags.reload ? { reload: true } : {})
    });
    if (result.source === 'memory') {
      note(
        `"${result.board}" was already open, so the canvas switched to the copy in memory ` +
        '(unsaved changes kept). Pass --reload to take the vault\'s copy instead.'
      );
    }
    if (result.declaredKey) {
      note(
        `Note: this file's frontmatter says it is board "${result.declaredKey}", not "${result.board}". ` +
        'The path is the address, so it opened as the path says; saving rewrites the frontmatter to match.'
      );
    }
    printJson(result);
    return;
  }

  // save
  const { flags } = parseArgs(rest, { ...ADDRESS_FLAGS, as: { takesValue: true } });
  const result = await saveBoard({
    ...(flags.as ? { name: flags.as as string } : {}),
    ...(flags.variant ? { variant: flags.variant as string } : {}),
    ...(flags.level ? { level: flags.level as string } : {})
  });
  // Surfaced on every save, not only the first: this is the whole of the
  // two-writer story until TASK-010 decides one, and a policy nobody is told
  // about is the same as no policy.
  if (result.warning) note(result.warning);
  printJson(result);
}
