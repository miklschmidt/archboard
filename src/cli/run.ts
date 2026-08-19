import { CliUsageError } from './args.js';
import { packageVersion } from '../core/version.js';
import * as server from './commands/server.js';
import * as elements from './commands/elements.js';
import * as scene from './commands/scene.js';
import { panes, selection } from './commands/selection.js';
import { promote, demote } from './commands/promote.js';
import { snapshot } from './commands/snapshot.js';
import { board } from './commands/board.js';
import { compare } from './commands/compare.js';
import { changes } from './commands/changes.js';
import { inject } from './commands/inject.js';
import { arrange } from './commands/arrange.js';
import { installSkill } from './commands/install-skill.js';
import { library } from './commands/library.js';

interface Command {
  handler: (argv: string[]) => Promise<void>;
  summary: string;
  usage: string;
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
  promote: { handler: promote, summary: 'Declare the selected elements a node — kind, identity, binding', usage: 'promote --kind service|queue|datastore|gateway|external [--ids a,b,c] [--name "Payments"] [--node payments] [--path src/payments/service.ts] [--repo host/owner/name] [--branch main] [--commit sha] [--variant current] [--level system|service|module] [--each] [--text]  (default target is the live selection; --each makes one node per selected shape)' },
  demote: { handler: demote, summary: 'Turn nodes back into plain elements', usage: 'demote [--ids a,b,c] [--text]  (default target is the live selection; demotes every element of each node it touches)' },
  board: {
    handler: board,
    summary: 'Load, save and list boards in the vault',
    usage: [
      'board list | current | new <name> [--variant v] [--level system|service|module]',
      '        | open <name[@variant]> [--variant v] [--reload] | save [--as <name>] [--variant v] [--level l] [--force]',
      '',
      '  A board is one .excalidraw.md note in the vault at ARCHBOARD_VAULT; the canvas holds one at a time.',
      '  The variant "current" owns the bare name — the architecture that exists. Every other variant is',
      '  addressed and stored as name@variant, so three-way option comparison is just three names.',
      '',
      '  SAVES ARE CHECKED, NOT LOCKED. archboard hashes a note when it reads it and verifies that hash',
      '  before writing. If the note changed underneath — Obsidian, a sync client, another editor — the',
      '  save is refused, nothing is written, and it exits 5 naming three ways out: reload the note',
      '  (`board open <name> --reload`), overwrite it (`board save --force`), or keep both',
      '  (`board save --as <other>`). archboard never picks for you. Nothing is locked, so keep a board',
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
      'changes [--since <cursor>] [--board <key>] [--coalesce] [--detail] [--text]',
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
  screenshot: { handler: scene.screenshot, summary: 'Capture the canvas (needs an open browser tab)', usage: 'screenshot [--out file.png] [--format png|svg] [--no-background]' },
  export: { handler: scene.exportCmd, summary: 'Export the scene as .excalidraw JSON or Obsidian .excalidraw.md', usage: 'export [--out scene.excalidraw | note.excalidraw.md] [--format json|obsidian] [--force] (a .md out path implies obsidian; --force overwrites a non-Excalidraw destination, still preserving its frontmatter)' },
  import: { handler: scene.importCmd, summary: 'Import a .excalidraw or Obsidian .excalidraw.md file (merge by default)', usage: 'import [scene.excalidraw|note.excalidraw.md|-] [--replace] (or stdin)' },
  mermaid: { handler: scene.mermaid, summary: 'Render a Mermaid diagram onto the canvas (needs a browser tab)', usage: 'mermaid [diagram.mmd|-] (or stdin)' },
  snapshot: { handler: snapshot, summary: 'Save / list / restore named canvas snapshots', usage: 'snapshot save|list|restore [name] [--force]  (a snapshot belongs to the board it was taken on; --force restores it onto a different one)' },
  library: { handler: library, summary: 'What stencils are in the library', usage: 'library list [--text]  (the palette lives on the canvas server, not in a browser profile, which is why an agent can read it at all)' },
  arrange: { handler: arrange, summary: 'Align, distribute, group, lock, duplicate elements', usage: 'arrange align|distribute|group|ungroup|lock|unlock|duplicate --ids a,b,c [--to left|horizontal|...]' },
  share: { handler: scene.share, summary: 'Export to a shareable excalidraw.com URL', usage: 'share' },
  clear: { handler: scene.clear, summary: 'Clear the whole canvas', usage: 'clear --yes' },
  'install-skill': { handler: installSkill, summary: 'Install the bundled agent skill', usage: 'install-skill [--dir <skills-root>] [--target claude|codex|<skills-root>] [--print-source]' }
};

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
  return 1;
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
