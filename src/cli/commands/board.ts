import { parseArgs, CliUsageError } from '../args.js';
import { printJson, note } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import {
  listBoardsOnCanvas,
  getCurrentBoard,
  openBoard,
  newBoard,
  saveBoard,
  boardConflictOf
} from '../../core/canvas-client.js';

export const SUBCOMMANDS = ['list', 'current', 'new', 'open', 'save'] as const;

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
  const { flags } = parseArgs(rest, {
    ...ADDRESS_FLAGS,
    as: { takesValue: true },
    force: { takesValue: false }
  });

  let result;
  try {
    result = await saveBoard({
      ...(flags.as ? { name: flags.as as string } : {}),
      ...(flags.variant ? { variant: flags.variant as string } : {}),
      ...(flags.level ? { level: flags.level as string } : {}),
      ...(flags.force ? { force: true } : {})
    });
  } catch (error) {
    const conflict = boardConflictOf(error);
    if (!conflict) throw error;
    // A refused save is an answer, not a crash: the message goes to stderr for
    // the human, the structured conflict to stdout for whatever is scripting
    // this, and the exit code says which of the two happened.
    note(conflict.message);
    printJson({ success: false, conflict });
    const quiet = new Error(conflict.message);
    (quiet as any).quiet = true;
    (quiet as any).code = 'BOARD_CONFLICT';
    throw quiet;
  }

  if (result.forced) {
    note(`Overwrote ${result.file} on your say-so; whatever that note held is gone.`);
  } else if (result.overwrote) {
    // The convention, stated where it is actionable: the check catches a note
    // that has already changed on disk, and cannot see a copy still sitting in
    // another editor's memory.
    note(
      'Saved after checking the note had not changed on disk. archboard cannot see an unsaved copy ' +
      'held in Obsidian, so keep a board open in one editor at a time.'
    );
  }
  printJson(result);
}
