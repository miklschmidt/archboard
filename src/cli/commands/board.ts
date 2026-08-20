import { parseArgs, CliUsageError } from '../args.js';
import { printJson, note } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import {
  listBoardsOnCanvas,
  getBoardInfo,
  openBoard,
  newBoard,
  saveBoard,
  boardConflictOf
} from '../../core/canvas-client.js';

export const SUBCOMMANDS = ['list', 'info', 'new', 'open', 'save'] as const;

// Boards are addressed as `name` or `name@variant` — `current` is the variant
// that owns the bare name, because it is the architecture that exists.
const ADDRESS_FLAGS = {
  variant: { takesValue: true },
  level: { takesValue: true }
};

// Which pane to show the board in. Required once more than one pane is open:
// putting a board on the half of the screen nobody asked for is a guess, and
// the canvas refuses rather than making it.
const PANE_FLAG = { pane: { takesValue: true } };

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
    // Two notes at one address. Only one of them can be opened, so this is
    // said out loud rather than left in the JSON (ADR 0010).
    const collisions = (result.boards ?? []).filter(entry => entry.collidesWith?.length);
    const reported = new Set<string>();
    for (const entry of collisions) {
      if (reported.has(entry.key)) continue;
      reported.add(entry.key);
      note(
        `"${entry.key}" is the address of ${(entry.collidesWith?.length ?? 0) + 1} notes that differ only in ` +
        `casing or accents: ${[entry.file, ...(entry.collidesWith ?? [])].join(', ')}. ` +
        `Board names are case-insensitive, so only ${entry.file} is reachable. Rename or delete the others.`
      );
    }
    printJson({
      success: true,
      vault: result.vault,
      boards: result.boards,
      open: result.open,
      onScreen: result.onScreen
    });
    return;
  }

  if (sub === 'info') {
    parseArgs(rest, {});
    const result = await getBoardInfo();
    printJson(result);
    return;
  }

  if (sub === 'new') {
    const { positionals, flags } = parseArgs(rest, { ...ADDRESS_FLAGS, ...PANE_FLAG });
    const name = positionals[0];
    if (!name) throw new CliUsageError('board new needs a name');
    const result = await newBoard({
      board: name,
      ...(flags.variant ? { variant: flags.variant as string } : {}),
      ...(flags.level ? { level: flags.level as string } : {}),
      ...(flags.pane ? { pane: flags.pane as string } : {})
    });
    note(
      `Board "${result.board}" is empty and exists only in memory until you run ` +
      `\`board save --board ${result.board}\`.` +
      (result.pane ? ` It is on screen in the ${result.pane.place} pane.` : '')
    );
    printJson(result);
    return;
  }

  if (sub === 'open') {
    const { positionals, flags } = parseArgs(rest, {
      ...ADDRESS_FLAGS, ...PANE_FLAG, reload: { takesValue: false }
    });
    const name = positionals[0];
    if (!name) throw new CliUsageError('board open needs a board name');
    const result = await openBoard({
      board: name,
      ...(flags.variant ? { variant: flags.variant as string } : {}),
      ...(flags.level ? { level: flags.level as string } : {}),
      ...(flags.reload ? { reload: true } : {}),
      ...(flags.pane ? { pane: flags.pane as string } : {})
    });
    // Where it landed, said out loud: opening a board shows it somewhere, and
    // which pane that is is the one thing the caller cannot see from here.
    note(
      result.pane
        ? `"${result.board}" is showing in the ${result.pane.place} pane. ` +
          `Commands still name it: \`--board ${result.board}\`.`
        : `"${result.board}" is loaded, but no pane is open, so nothing is showing it.`
    );
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
