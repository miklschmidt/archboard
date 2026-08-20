import { parseArgs, CliUsageError } from '../args.js';
import { printJson, note } from '../util.js';
import { ensureCanvasRunning } from '../../core/spawn.js';
import { repoIdentityAt, repoRootOf } from '../../core/git.js';
import {
  listBoardsOnCanvas,
  getBoardInfo,
  openBoard,
  newBoard,
  saveBoard,
  boardConflictOf
} from '../../core/canvas-client.js';

export const SUBCOMMANDS = ['list', 'info', 'new', 'open', 'save'] as const;

/**
 * The repository the caller is standing in, as an identity.
 *
 * This is a read, not a write: asking which boards describe where you are is
 * exactly a question about here. The identity is still resolved in this
 * process, where the working directory belongs to the caller, and printed back,
 * so nothing downstream has to guess (ADR 0011).
 */
function repoIdentityHere(): string {
  const root = repoRootOf(process.cwd());
  if (!root) {
    throw new CliUsageError(
      `${process.cwd()} is not inside a git repository, so there is no repository to look for. ` +
      'Name one with --repo <host/owner/name>, or drop the filter to list every board.'
    );
  }
  return repoIdentityAt(root);
}

/** The listing as prose: what an agent arriving in a repo reads. */
function boardListText(result: Awaited<ReturnType<typeof listBoardsOnCanvas>>): string {
  if (result.repo) {
    if (result.boards.length === 0) {
      return `No board in ${result.vault} has a node bound to ${result.repo} ` +
        `(${result.scanned ?? 0} board(s) read).`;
    }
    const lines = [`Boards describing ${result.repo}:`];
    for (const board of result.boards) {
      const level = board.identity?.level ? `, ${board.identity.level}` : '';
      lines.push(`  ${board.key} (${board.identity?.variant ?? 'current'}${level}, ${board.source ?? 'vault'})`);
      for (const node of board.nodes ?? []) {
        lines.push(`    ${node.name ?? node.node}${node.kind ? ` [${node.kind}]` : ''} -> ${node.path}`);
      }
    }
    lines.push(`Open one with \`board open ${result.boards[0]!.key}\`.`);
    return lines.join('\n');
  }
  if (result.boards.length === 0) return `No boards in ${result.vault} yet.`;
  return [`Boards in ${result.vault}:`, ...result.boards.map(board => `  ${board.key}`)].join('\n');
}

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
    const { flags } = parseArgs(rest, {
      repo: { takesValue: true },
      here: { takesValue: false },
      text: { takesValue: false }
    });

    // Which repository, if the question is "what describes this code" rather
    // than "what boards are there". --here reads the working directory, which
    // on a command line is the caller's own; the identity it found is echoed,
    // and the server is only ever given an identity (ADR 0011).
    let repo: string | undefined;
    if (flags.here) {
      if (typeof flags.repo === 'string') throw new CliUsageError('--here and --repo say the same thing twice; pick one.');
      repo = repoIdentityHere();
      note(`Standing in ${repo}.`);
    } else if (typeof flags.repo === 'string') {
      repo = flags.repo;
    }

    const result = await listBoardsOnCanvas(repo);
    // A canvas server older than this CLI ignores ?repo= and answers with every
    // board. Silently handing that back as "the boards describing your repo"
    // would be a wrong answer wearing a right answer's clothes.
    if (repo && !result.repo) {
      throw new Error(
        'The canvas server is older than this CLI and ignored the repository filter, so this would ' +
        'have listed every board as though each described ' + repo + '. Restart it (`canvas stop` ' +
        'then `canvas start`) and try again.'
      );
    }

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

    if (flags.text) {
      process.stdout.write(boardListText(result) + '\n');
      return;
    }
    printJson({
      success: true,
      vault: result.vault,
      ...(result.repo ? { repo: result.repo, scanned: result.scanned } : {}),
      ...(result.unreadable ? { unreadable: result.unreadable } : {}),
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
