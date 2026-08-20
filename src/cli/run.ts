import { CliUsageError } from './args.js';
import { setRequestedBoard } from '../core/canvas-client.js';
import { packageVersion } from '../core/version.js';
import * as server from './commands/server.js';
import * as elements from './commands/elements.js';
import * as scene from './commands/scene.js';
import { panes, selection } from './commands/selection.js';
import { pane, SUBCOMMANDS as PANE_SUBCOMMANDS } from './commands/pane.js';
import { viewport } from './commands/viewport.js';
import { promote, demote } from './commands/promote.js';
import { snapshot, ACTIONS as SNAPSHOT_ACTIONS } from './commands/snapshot.js';
import { board, SUBCOMMANDS as BOARD_SUBCOMMANDS } from './commands/board.js';
import { compare } from './commands/compare.js';
import { changes } from './commands/changes.js';
import { inject, SUBCOMMANDS as INJECT_SUBCOMMANDS } from './commands/inject.js';
import { arrange, OPERATIONS as ARRANGE_OPERATIONS } from './commands/arrange.js';
import { installSkill } from './commands/install-skill.js';
import { library, ACTIONS as LIBRARY_ACTIONS } from './commands/library.js';

interface Command {
  handler: (argv: string[]) => Promise<void>;
  summary: string;
  usage: string;
  // Present when the command takes a subcommand, from the list the command's
  // own dispatcher validates against. This is the CLI half of what
  // `scripts/check-surface-parity.mjs` compares with the MCP tool list.
  subcommands?: readonly string[];
}

const COMMANDS: Record<string, Command> = {
  start: { handler: server.start, summary: 'Start the canvas server (detached)', usage: 'start' },
  stop: { handler: server.stop, summary: 'Stop the canvas server', usage: 'stop' },
  status: { handler: server.status, summary: 'Canvas health, element count, browser clients', usage: 'status' },
  apply: { handler: elements.apply, summary: 'Apply a {create,update,delete} patch in one call', usage: 'apply [patch.json|-] (update entries accept direct fields or {id,set:{...}})' },
  add: { handler: elements.add, summary: 'Create elements from a JSON array', usage: 'add [elements.json] (or stdin) | add --one \'{"type":"rectangle",...}\'' },
  update: { handler: elements.update, summary: 'Update one element', usage: 'update <id> --set \'{"backgroundColor":"#ffc9c9"}\'' },
  delete: { handler: elements.del, summary: 'Delete elements by id', usage: 'delete <id> [<id> ...]' },
  get: { handler: elements.get, summary: 'Get one element by id', usage: 'get <id>' },
  query: { handler: elements.query, summary: 'Query elements (server + typed client-side filters)', usage: 'query [--type rectangle] [--bbox x0,y0,x1,y1] [--filter locked=true] [--filter-json \'{...}\']' },
  selection: { handler: selection, summary: 'What a human currently has selected on the board', usage: 'selection [--text]' },
  panes: {
    handler: panes,
    summary: 'What the human is currently looking at — pane by pane',
    usage: [
      'panes [--text]',
      '',
      '  One entry per pane on screen, in reading order: where it sits (left/right/top/bottom),',
      '  which board and variant it holds, how much of that board is in view, and what is selected',
      '  in it. This is how "the left one" and "move that box over there" get resolved by something',
      '  that cannot see the screen.',
      '',
      '  VIEW STATE ONLY — it never lists elements, so it stays cheap enough to call every turn.',
      '  Use `describe` for what is on a board and `selection` for the full detail of one pick.',
      '  No pane at all is normal: it means no browser is open, not that anything is wrong.'
    ].join('\n')
  },
  pane: {
    handler: pane,
    subcommands: PANE_SUBCOMMANDS,
    summary: 'Split the canvas into another pane, or close one',
    usage: [
      'pane open [--board <key>] | pane close <left|right|1|2|primary|focused|pane id>',
      '',
      '  A pane is a slot holding one board, and two panes are how the architecture that exists sits',
      '  beside a proposal. Layout used to be a click in the browser, so a thread that could only',
      '  talk had one pane and reused it — which meant overwriting the board the human was reading.',
      '',
      '  `pane open --board <key>` is the whole side-by-side move in one command: it makes a new pane',
      '  and opens that board into it. It CANNOT target an existing pane, so it cannot overwrite one.',
      '  With no --board the new pane shows whatever was already on screen, like pressing Split.',
      '',
      '  Two panes is the limit the shell lays out. A pane exists only while a browser tab is',
      '  rendering it, so both of these need one open and exit 4 when there is none — nothing here',
      '  invents a pane on a headless canvas. Closing a pane takes a board off the screen and does',
      '  nothing to the board itself; the last pane cannot be closed.',
      '',
      '  `archboard panes` (plural) is the read: which pane holds which board, and what is in view.'
    ].join('\n')
  },
  viewport: {
    handler: viewport,
    summary: 'Point a pane\'s camera: fit, centre, or zoom (needs a browser tab)',
    usage: [
      'viewport --fit [--zoom-factor 0.8] [--pane <spec>]',
      'viewport --ids a,b,c [--zoom-factor 0.8] [--pane <spec>]',
      'viewport --element <id> [--pane <spec>]',
      'viewport --zoom 1.5 [--offset-x 0] [--offset-y 0] [--pane <spec>]',
      '',
      '  Exactly one of those four. --fit frames everything on the board, --ids frames those elements,',
      '  --element centres on one without changing zoom, and the last sets the camera by hand.',
      '  --zoom-factor is the padding on a fit: lower leaves more room around the content.',
      '',
      '  It names a PANE, not a board, because a pane holds one board and that settles which is meant',
      '  (ADR 0009). With one pane on screen that is the one; with two, --pane says which half moves,',
      '  and without it the pane that answers for the browser does.'
    ].join('\n')
  },
  promote: { handler: promote, summary: 'Declare the selected elements a node — kind, identity, binding', usage: 'promote --kind service|queue|datastore|gateway|external [--ids a,b,c] [--name "Payments"] [--node payments] [--path src/payments/service.ts] [--repo host/owner/name] [--branch main] [--commit sha] [--variant current] [--level system|service|module] [--each] [--text]  (default target is the live selection; --each makes one node per selected shape)' },
  demote: { handler: demote, summary: 'Turn nodes back into plain elements', usage: 'demote [--ids a,b,c] [--text]  (default target is the live selection; demotes every element of each node it touches)' },
  board: {
    handler: board,
    subcommands: BOARD_SUBCOMMANDS,
    summary: 'Load, save and list boards in the vault',
    usage: [
      'board list | info | new <name> [--variant v] [--level system|service|module] [--pane <spec>]',
      '        | open <name[@variant]> [--variant v] [--reload] [--pane <spec>]',
      '        | save --board <key> [--as <name>] [--variant v] [--level l] [--force]',
      '',
      '  A board is one .excalidraw.md note in the vault at ARCHBOARD_VAULT; a PANE holds one at a time,',
      '  and two panes hold two — which is what side-by-side current-vs-proposed is. --pane takes left,',
      '  right, top, bottom, a 1-based position, primary, or a pane id, and is required once more than',
      '  one pane is open; with a single pane the board goes there, with none it is loaded unshown.',
      '  The variant "current" owns the bare name — the architecture that exists. Every other variant is',
      '  addressed and stored as name@variant, so three-way option comparison is just three names.',
      '',
      '  SAVES ARE CHECKED, NOT LOCKED. archboard hashes a note when it reads it and verifies that hash',
      '  before writing. If the note changed underneath — Obsidian, a sync client, another editor — the',
      '  save is refused, nothing is written, and it exits 5 naming three ways out: reload the note',
      '  (`board open <name> --reload`), overwrite it (`--force`), or keep both',
      '  (`--as <other>`). archboard never picks for you. Nothing is locked, so keep a board',
      '  open in one editor at a time: the check catches a changed file, not a copy in another app\'s memory.'
    ].join('\n')
  },
  compare: {
    handler: compare,
    summary: 'Structured semantic diff between two variants of a board',
    usage: [
      'compare <from> [to]        e.g. compare payments payments@option-a',
      '',
      '  Diffs two boards on NODE IDENTITY (customData.archboard.node), not on element ids or',
      '  geometry, so two variants authored independently still compare. Nodes and edges added,',
      '  removed, changed (with what changed about each) and unchanged; layout expressed as',
      '  relative structure — who sits with whom, what contains what, what is grouped, whereabouts,',
      '  relative direction, relative size — never as coordinate deltas. The output names what that',
      '  model deliberately cannot express, under layout.cannotExpress.',
      '',
      '  Output is JSON and complete: nothing is summarised into prose and nothing is truncated,',
      '  because the caller is expected to narrate it. Elements that are not nodes have no identity',
      '  across boards, so they are inventoried per side rather than diffed.',
      '',
      '  With one address the other side is found among that board\'s variants in the vault, and the',
      '  "current" variant is always the from side. Neither board is opened: a board already open is',
      '  read from memory (unsaved work included), any other straight from its note, and the board on',
      '  the canvas is left exactly as it was.'
    ].join('\n')
  },
  changes: {
    handler: changes,
    summary: 'Semantic changes on the board since a cursor — what it became, not which pixels moved',
    usage: [
      'changes --board <key> [--since <cursor>] [--coalesce] [--detail] [--text]',
      '',
      '  Nodes and edges added, removed, changed, promoted, rerouted; layout as relative structure',
      '  (who sits with whom, what contains what, whereabouts, which side of what) — the same',
      '  vocabulary `compare` uses, on one board across time instead of two boards side by side.',
      '',
      '  A drag is ONE event, reported when the board settles, or none at all: element deltas never',
      '  surface, and a change that is only colour or a nudge too small to mean anything is not an',
      '  event. Nothing is emitted for it and the baseline does not move, so small movements still',
      '  add up until they cross a threshold.',
      '',
      '  Cursor-based, for a caller that runs once per turn and remembers where it got to. Pass the',
      '  cursor from the last response as --since; --coalesce answers with one net diff from there',
      '  to now instead of a replay of every event in between.'
    ].join('\n')
  },
  inject: {
    handler: inject,
    subcommands: INJECT_SUBCOMMANDS,
    summary: 'Whether the canvas can push board changes into a live Codex thread, and a probe to prove it',
    usage: [
      'inject status | inject test [--note "..."] [--loud]',
      '',
      '  Board changes reach a running Codex thread through the app-server control socket, quietly:',
      '  `thread/inject_items` appends to the thread\'s history without starting a turn, so the agent',
      '  sees the change next time it speaks and nothing is interrupted.',
      '',
      '  OFF unless the canvas server was started with ARCHBOARD_INJECT=1, and off regardless when the',
      '  canvas is bound to anything but loopback — anything that can reach the canvas could otherwise',
      '  drive the coding agent (ADR 0005). Both are decided at server start; there is nothing to turn',
      '  on from here. `status` says which of those applies, and which thread would be told.',
      '',
      '  `test` injects a message that says it is a test, for checking the wiring without touching a',
      '  board. --loud sends it through `turn/steer` instead, for that one probe.'
    ].join('\n')
  },
  describe: { handler: scene.describe, summary: 'AI-readable scene description (plain text)', usage: 'describe' },
  screenshot: {
    handler: scene.screenshot,
    summary: 'Capture one pane (needs an open browser tab)',
    usage: [
      'screenshot [--out file.png] [--format png|svg] [--no-background] [--pane <spec>]',
      '',
      '  A picture of one pane, so with two on screen it takes --pane left|right|1|2 to say which',
      '  half. Without it the pane that answers for the browser is photographed, which with a single',
      '  pane is that pane — and with two is the one you may not have drawn in.'
    ].join('\n')
  },
  export: { handler: scene.exportCmd, summary: 'Export the scene as .excalidraw JSON or Obsidian .excalidraw.md', usage: 'export [--out scene.excalidraw | note.excalidraw.md] [--format json|obsidian] [--force] (a .md out path implies obsidian; --force overwrites a non-Excalidraw destination, still preserving its frontmatter)' },
  import: { handler: scene.importCmd, summary: 'Import a .excalidraw or Obsidian .excalidraw.md file (merge by default)', usage: 'import [scene.excalidraw|note.excalidraw.md|-] [--replace] (or stdin)' },
  mermaid: { handler: scene.mermaid, summary: 'Render a Mermaid diagram onto the canvas (needs a browser tab)', usage: 'mermaid [diagram.mmd|-] (or stdin)' },
  snapshot: { handler: snapshot, subcommands: SNAPSHOT_ACTIONS, summary: 'Save / list / restore named canvas snapshots', usage: 'snapshot save|list|restore [name] [--force]  (a snapshot belongs to the board it was taken on; --force restores it onto a different one)' },
  library: { handler: library, subcommands: LIBRARY_ACTIONS, summary: 'What stencils are in the library, and dropping one onto the board', usage: 'library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]  (the palette lives on the canvas server, not in a browser profile, which is why an agent can read and place from it without a browser)' },
  arrange: { handler: arrange, subcommands: ARRANGE_OPERATIONS, summary: 'Align, distribute, group, lock, duplicate elements', usage: 'arrange align|distribute|group|ungroup|lock|unlock|duplicate --ids a,b,c [--to left|horizontal|...]' },
  share: { handler: scene.share, summary: 'Export to a shareable excalidraw.com URL', usage: 'share' },
  clear: { handler: scene.clear, summary: 'Clear the whole canvas', usage: 'clear --yes' },
  'install-skill': { handler: installSkill, summary: 'Install the bundled agent skill', usage: 'install-skill [--dir <skills-root>] [--target claude|codex|<skills-root>] [--print-source]' }
};

/**
 * Every way the CLI can be invoked, as `{ name, subcommands }` — the command
 * table read as data. `scripts/check-surface-parity.mjs` uses it to hold the
 * MCP tool list against the CLI, so that MCP cannot quietly fall behind the
 * surface agents actually use (ADR 0008).
 */
export function cliSurface(): { name: string; subcommands: readonly string[] }[] {
  return Object.entries(COMMANDS).map(([name, command]) => ({
    name,
    subcommands: command.subcommands ?? []
  }));
}

function printHelp(): void {
  const lines = [
    `archboard ${packageVersion()} — Excalidraw architecture canvas for AI coding agents`,
    '',
    'Usage:',
    '  archboard                  Run the MCP stdio server (for MCP clients)',
    '  archboard <command> [...]  Drive the canvas from the command line',
    '',
    '  Inside the archboard checkout, `./bin/canvas <command>` runs the local',
    '  dist/ build from any cwd. The package is private — there is nothing to',
    '  install from npm.',
    '',
    'Commands:',
    ...Object.entries(COMMANDS).map(([name, cmd]) => `  ${name.padEnd(14)} ${cmd.summary}`),
    '',
    'Conventions:',
    '  Results are JSON on stdout — except `describe` (plain text), `selection --text`,',
    '  and raw-content output when --out is omitted (`export` scene JSON,',
    '  `screenshot --format svg`).',
    '  Diagnostics go to stderr.',
  '  --board <key> is global and REQUIRED on every command that touches a board. There is no',
  '    default: a pane holds its own board, so "the board" would be a guess (ADR 0009). A call',
  '    without it is refused, and the refusal lists the boards that are open.',
    '  Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required,',
    '               5 board write refused (the note changed on disk).',
    '  Canvas-driving commands auto-start the server (disable with EXCALIDRAW_NO_AUTOSTART=1).',
    '  Canvas URL comes from EXPRESS_SERVER_URL (default http://127.0.0.1:3000) or --url.',
    '',
    'Run `archboard help <command>` for per-command usage.'
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

function exitCodeFor(error: unknown): number {
  if (error instanceof CliUsageError) return 2;
  const code = (error as any)?.code;
  if (code === 'CANVAS_UNREACHABLE') return 3;
  if (code === 'BROWSER_REQUIRED') return 4;
  if (code === 'BOARD_CONFLICT') return 5;
  // A missing board is a mistake at the keyboard, like any other usage error.
  if (code === 'BOARD_REQUIRED') return 2;
  return 1;
}

/**
 * Pull `--board <key>` out of the arguments before the command sees it.
 *
 * Global, like `--url`, because it applies to every canvas request a command
 * makes rather than to one of them — and it is the only way to name a board,
 * because there is no default (ADR 0009). Stripped here so no command has to
 * declare it and none can forget to pass it on.
 */
function takeBoardFlag(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === '--board') {
      const value = argv[i + 1];
      if (value === undefined) throw new CliUsageError('Flag --board requires a value');
      argv.splice(i, 2);
      return value;
    }
    if (token.startsWith('--board=')) {
      argv.splice(i, 1);
      return token.slice('--board='.length);
    }
  }
  return null;
}

export async function runCli(argv: string[]): Promise<void> {
  const [name, ...rest] = argv;

  if (!name || name === 'help' || name === '--help' || name === '-h') {
    const topic = name === 'help' ? rest[0] : undefined;
    if (topic && COMMANDS[topic]) {
      process.stdout.write(`Usage: archboard ${COMMANDS[topic].usage}\n  ${COMMANDS[topic].summary}\n`);
    } else {
      printHelp();
    }
    return;
  }

  if (name === '--version' || name === '-v' || name === 'version') {
    process.stdout.write(packageVersion() + '\n');
    return;
  }

  const command = COMMANDS[name];
  if (!command) {
    process.stderr.write(`Unknown command "${name}". Run \`archboard help\` for the list.\n`);
    process.exitCode = 2;
    return;
  }

  try {
    setRequestedBoard(takeBoardFlag(rest));
    await command.handler(rest);
  } catch (error) {
    if (!(error as any)?.quiet) {
      process.stderr.write(`Error: ${(error as Error).message}\n`);
    }
    if (error instanceof CliUsageError) {
      process.stderr.write(`Usage: archboard ${command.usage}\n`);
    }
    process.exitCode = exitCodeFor(error);
  }
}
