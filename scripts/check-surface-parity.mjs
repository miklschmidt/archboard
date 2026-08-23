#!/usr/bin/env bun

// Does the MCP surface still match the CLI?
//
// Archboard exposes the same canvas twice. The CLI is the default surface and
// the one every agent here uses; MCP exists for a client that cannot run a
// shell (ADR 0008). A surface nobody exercises rots quietly, and MCP would
// then be broken on the one day someone opens archboard in Claude Desktop —
// which is the whole reason for keeping it. This check is what notices.
//
// Parity is not one-to-one. 39 tools against 30 commands, because a command
// may take a subcommand: `arrange group` and `board save` are each one tool's
// worth of surface. So the comparison is between MCP tool names and CLI
// ENTRIES — a command, or a command plus subcommand — paired explicitly below.
//
// Both sides are read from the code, never restated here:
//   MCP   `tools` in src/core/mcp-tools.ts, the array the client is served
//   CLI   `cliSurface()` in src/cli/run.ts — the command table read as data,
//         with each subcommand list coming from the module that validates it
//
// Adding a capability to either side therefore fails this check until it is
// paired or written down as an asymmetry with a reason.

import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const { tools } = await import(join(repoRoot, 'src', 'core', 'mcp-tools.ts'));
const { cliSurface } = await import(join(repoRoot, 'src', 'cli', 'run.ts'));
const { formatBoardRefusal } = await import(join(repoRoot, 'src', 'core', 'canvas-client.ts'));
const {
  CREATE_ELEMENT_JSON_SCHEMA,
  UPDATE_ELEMENT_JSON_SCHEMA
} = await import(join(repoRoot, 'src', 'core', 'apply-element-input.ts'));

// --- the mapping -------------------------------------------------------------
//
// One CLI entry to the tool(s) that do the same job. Two tools against one
// entry is a real shape, not a fudge: `add` covers both the single-element and
// the batch tool, and `screenshot` covers both ways MCP returns a picture.

const PAIRS = [
  ['add', ['create_element', 'batch_create_elements']],
  ['update', ['update_element']],
  ['delete', ['delete_element']],
  ['get', ['get_element']],
  ['query', ['query_elements']],
  ['describe', ['describe_scene']],
  ['selection', ['get_selection']],
  ['panes', ['get_panes']],
  ['pane open', ['open_pane']],
  ['pane close', ['close_pane']],
  ['viewport', ['set_viewport']],
  ['promote', ['promote_selection']],
  ['demote', ['demote_selection']],
  ['compare', ['compare_boards']],
  ['screenshot', ['get_canvas_screenshot', 'export_to_image']],
  ['export', ['export_scene']],
  ['import', ['import_scene']],
  ['mermaid', ['create_from_mermaid']],
  ['share', ['export_to_excalidraw_url']],
  ['clear', ['clear_canvas']],
  ['board list', ['list_boards']],
  ['board new', ['new_board']],
  ['board open', ['open_board']],
  ['board save', ['save_board']],
  ['arrange align', ['align_elements']],
  ['arrange distribute', ['distribute_elements']],
  ['arrange group', ['group_elements']],
  ['arrange ungroup', ['ungroup_elements']],
  ['arrange lock', ['lock_elements']],
  ['arrange unlock', ['unlock_elements']],
  ['arrange duplicate', ['duplicate_elements']],
  ['library list', ['list_library_items']],
  ['library insert', ['insert_library_item']],
  ['snapshot save', ['snapshot_scene']],
  ['snapshot restore', ['restore_snapshot']],
  ['claim', ['claim_board']],
  ['release', ['release_board']]
];

// --- the asymmetries ---------------------------------------------------------
//
// Every entry carries its reason, and both lists are printed on every run, so
// an asymmetry stays something the project keeps saying out loud rather than a
// place drift can hide. A reason that reads "MCP lags" or "CLI lags" records
// missing parity, not a decision — it should shrink.

const CLI_ONLY = {
  'repo list': 'the checkout registry is host state. It maps a repository identity to a directory on THIS machine (ADR 0011). MCP consumes it: `promote_selection` takes a repo identity and resolves through the registry. A client with no shell cannot see the filesystem those entries name, so it cannot maintain them.',
  'repo add': 'as `repo list`: pointing at a directory is a filesystem act, for the agent that has one.',
  'repo forget': 'as `repo list`.',
  start: 'process lifecycle on the host. MCP starts the canvas itself before any tool that needs it, and a shell-less client has no local process to manage.',
  stop: 'as `start`: stopping a local process is a shell act.',
  status: 'as `start`. A client that reaches the tools already has a live canvas behind them.',
  apply: 'one process spawn instead of three, which is a CLI cost. An MCP client reaches the same state with the create/update/delete tools in one turn.',
  changes: 'MCP lags. The change feed landed CLI-first for the voice loop; an MCP client can read the board with `describe_scene` but cannot ask what changed.',
  'install-skill': 'installs skill files into a skills root on this machine — a filesystem act for the agent that has one.',
  'board info': 'MCP lags. `list_boards` returns every open board with its element count and file, which answers most of what `board info` does, but not its save state.',
  'snapshot list': 'MCP lags. `snapshot_scene` and `restore_snapshot` exist with no listing tool, so an MCP client has to remember the names it saved.',
  'inject status': 'injection is decided when the canvas server starts, from ARCHBOARD_INJECT and the bound address (ADR 0005); reading and probing it is an operator act on the host, not canvas work.',
  'inject test': 'as `inject status` — a wiring probe for the machine running the canvas.'
};

const MCP_ONLY = {
  read_diagram_guide: 'deliberate. The design guide is skill content (references/cheatsheet.md); an agent with a shell reads the file, a shell-less client cannot, so MCP returns it.',
  get_resource: 'upstream aggregate accessor kept for clients written against mcp_excalidraw. `scene`, `elements` and `library` all reduce to elements plus theme, which `query`, `describe` and `export` cover.'
};

// The cheatsheet is where an MCP client learns the tool names, because it
// cannot run `archboard help`. A tool missing from it is invisible to exactly
// the reader MCP exists for.
const CHEATSHEET = join(repoRoot, 'skills', 'excalidraw-skill', 'references', 'cheatsheet.md');

// --- checks ------------------------------------------------------------------

const failures = [];
function fail(message) {
  failures.push(message);
}

const toolNames = new Set(tools.map(tool => tool.name));

const sameFields = (toolName, actual, expected) => {
  const missing = [...expected].filter(field => !actual.has(field));
  const extra = [...actual].filter(field => !expected.has(field));
  if (missing.length > 0 || extra.length > 0) {
    fail(
      `Tool \`${toolName}\` element fields differ from applyElementInput: ` +
      `missing [${missing.join(', ')}], extra [${extra.join(', ')}].`
    );
  }
};

// The converter owns the accepted element statement. MCP may describe those
// fields, but it must not maintain another validator that can strip one.
{
  const requestFields = new Set(['document', 'doing', 'board', 'expectVersion']);
  const createFields = new Set(Object.keys(CREATE_ELEMENT_JSON_SCHEMA.properties ?? {}));
  const updateFields = new Set(Object.keys(UPDATE_ELEMENT_JSON_SCHEMA.properties ?? {}));
  const createTool = tools.find(tool => tool.name === 'create_element');
  const updateTool = tools.find(tool => tool.name === 'update_element');
  const batchTool = tools.find(tool => tool.name === 'batch_create_elements');
  sameFields(
    'create_element',
    new Set(Object.keys(createTool?.inputSchema?.properties ?? {}).filter(field => !requestFields.has(field))),
    createFields
  );
  sameFields(
    'update_element',
    new Set(Object.keys(updateTool?.inputSchema?.properties ?? {}).filter(field => !requestFields.has(field))),
    updateFields
  );
  sameFields(
    'batch_create_elements',
    new Set(Object.keys(batchTool?.inputSchema?.properties?.elements?.items?.properties ?? {})),
    createFields
  );
}

const cliEntries = new Set();
for (const { name, subcommands } of cliSurface()) {
  if (subcommands.length === 0) cliEntries.add(name);
  else for (const sub of subcommands) cliEntries.add(`${name} ${sub}`);
}

const pairedEntries = new Set();
const pairedTools = new Set();
for (const [entry, entryTools] of PAIRS) {
  if (!cliEntries.has(entry)) {
    fail(`PAIRS maps "${entry}", which is not a CLI entry any more — rename it or drop the pair.`);
  }
  if (pairedEntries.has(entry)) fail(`PAIRS maps "${entry}" twice.`);
  pairedEntries.add(entry);
  for (const tool of entryTools) {
    if (!toolNames.has(tool)) {
      fail(`PAIRS maps "${entry}" to the tool \`${tool}\`, which mcp-tools.ts no longer declares.`);
    }
    if (pairedTools.has(tool)) fail(`PAIRS maps the tool \`${tool}\` twice.`);
    pairedTools.add(tool);
  }
}

// A tool with no command: MCP grew something the default surface lacks.
for (const tool of toolNames) {
  if (pairedTools.has(tool) || tool in MCP_ONLY) continue;
  fail(
    `MCP tool \`${tool}\` has no CLI command. The CLI is the default surface (ADR 0008), so add the ` +
    `command and pair it in PAIRS — or record the asymmetry in MCP_ONLY with a reason.`
  );
}

// A command with no tool: the CLI moved on and MCP is rotting behind it.
for (const entry of cliEntries) {
  if (pairedEntries.has(entry) || entry in CLI_ONLY) continue;
  fail(
    `CLI entry "${entry}" has no MCP tool. MCP is the only way in for a client without a shell ` +
    `(ADR 0008), so add the tool and pair it in PAIRS — or record the asymmetry in CLI_ONLY with a reason.`
  );
}

for (const [entry, reason] of Object.entries(CLI_ONLY)) {
  if (!cliEntries.has(entry)) fail(`CLI_ONLY lists "${entry}", which is not a CLI entry any more.`);
  if (pairedEntries.has(entry)) fail(`CLI_ONLY lists "${entry}", which PAIRS already maps to a tool.`);
  if (!reason.trim()) fail(`CLI_ONLY entry "${entry}" has no reason.`);
}

for (const [tool, reason] of Object.entries(MCP_ONLY)) {
  if (!toolNames.has(tool)) fail(`MCP_ONLY lists \`${tool}\`, which mcp-tools.ts no longer declares.`);
  if (pairedTools.has(tool)) fail(`MCP_ONLY lists \`${tool}\`, which PAIRS already maps to a command.`);
  if (!reason.trim()) fail(`MCP_ONLY entry \`${tool}\` has no reason.`);
}

// A declared tool with no dispatch arm answers "Unknown tool" on the wire.
const dispatchSource = fs.readFileSync(join(repoRoot, 'src', 'core', 'mcp-dispatch.ts'), 'utf8');
for (const tool of toolNames) {
  if (!dispatchSource.includes(`case '${tool}'`)) {
    fail(`Tool \`${tool}\` is declared in mcp-tools.ts with no \`case\` arm in mcp-dispatch.ts — the client gets "Unknown tool".`);
  }
}

// A refused write carries the board on the same response. Both agent-facing
// outputs use one formatter so neither can print only the reason and drop the
// document. The formatter itself keeps the reason ahead of the larger payload.
{
  const cliSource = fs.readFileSync(join(repoRoot, 'src', 'cli', 'run.ts'), 'utf8');
  if (!cliSource.includes('formatBoardRefusal(error)')) {
    fail('The CLI error path does not print a structured board refusal, so the attached document is hidden.');
  }
  if (!dispatchSource.includes('formatBoardRefusal(error)')) {
    fail('The MCP error path does not print a structured board refusal, so the attached document is hidden.');
  }
  const reason = 'Refusing to write "payments": somebody else has it.';
  const error = new Error(reason);
  error.refusal = {
    success: false,
    // Deliberately not in the CLI exit-code set: board-carrying refusals are
    // recognized by this body shape, so a new server refusal still prints it.
    code: 'BOARD_WRITE_REFUSED',
    error: reason,
    holder: { id: 'pane-1', kind: 'human' },
    waitedMs: 3000,
    document: [{ id: 'queue', type: 'rectangle' }],
    version: 7
  };
  const printed = formatBoardRefusal(error) ?? '';
  if (!printed.startsWith(reason)) {
    fail('The shared refusal formatter does not put the unchanged reason first.');
  }
  if (!printed.includes('"holder"') || !printed.includes('"waitedMs"') ||
      !printed.includes('"document"') || !printed.includes('"version": 7')) {
    fail('The shared refusal formatter drops reason data or the attached board.');
  }
}

// --- the writes, and what they answer with ----------------------------------
//
// Parity is normally about whether a capability exists on both surfaces, and
// tool names against command names is enough for that. `--document` is the
// exception worth spelling out: it is not a command, it is a promise about
// what every write returns, and a promise only one surface keeps is one an
// agent cannot rely on (TASK-075).
//
// So the four writes are named here, each with the CLI entry and the tool that
// do the same job, and both halves have to offer it — the CLI in the usage
// text `archboard help <command>` prints, MCP in the tool's input schema.
//
// `apply` is CLI-only and is deliberately not in this list: it has no tool,
// which CLI_ONLY already records, and an MCP client reaches the same state
// with the create/update/delete tools.

const WRITES = [
  ['add', 'batch_create_elements'],
  ['add', 'create_element'],
  ['update', 'update_element'],
  ['delete', 'delete_element']
];

// The CLI half is asked, not read. `parseArgs` refuses a flag it does not
// declare — "Unknown flag --x" — so running the command with `--document`
// followed by a flag nothing declares says which of the two it rejected, and
// that is the parser answering rather than the help text. Reading the usage
// string was the first attempt and it was worthless: the shared paragraph
// every write prints itself contains the word `--document`, so a command that
// had lost the flag entirely still looked like it had it.
const acceptsDocument = (entry) => {
  const run = spawnSync(process.execPath,
    [join(repoRoot, 'src', 'bin.ts'), ...entry.split(' '), '--document', '--not-a-real-flag'],
    { encoding: 'utf8', env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: '1' }, timeout: 20000 });
  const said = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (said.includes('Unknown flag --document')) return false;
  if (said.includes('Unknown flag --not-a-real-flag')) return true;
  return { unreadable: said.trim().split('\n')[0] ?? '(said nothing)' };
};

// And the synopsis has to mention it, because `archboard help <command>` is
// where a shell agent finds out a flag exists. Only the first paragraph counts,
// for the reason above.
const synopsisOf = (entry) => {
  const run = spawnSync(process.execPath, [join(repoRoot, 'src', 'bin.ts'), 'help', ...entry.split(' ')],
    { encoding: 'utf8', env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: '1' }, timeout: 20000 });
  return (run.stdout ?? '').split('\n\n')[0] ?? '';
};

const writeEntries = new Set(cliSurface().map(({ name }) => name));

for (const [entry, tool] of WRITES) {
  const declared = tools.find(candidate => candidate.name === tool);
  if (!writeEntries.has(entry)) {
    fail(`WRITES names the CLI entry "${entry}", which is not a CLI entry any more.`);
    continue;
  }
  if (!declared) {
    fail(`WRITES names the tool \`${tool}\`, which mcp-tools.ts no longer declares.`);
    continue;
  }
  const cliHas = acceptsDocument(entry);
  if (typeof cliHas !== 'boolean') {
    fail(`\`archboard ${entry} --document\` answered something this check cannot read — ` +
      `"${cliHas.unreadable}". It expects the parser to name whichever flag it rejected.`);
    continue;
  }
  const mcpHas = Boolean(declared.inputSchema?.properties?.document);
  if (cliHas && !mcpHas) {
    fail(`\`archboard ${entry}\` takes --document and the tool \`${tool}\` does not. What a write ` +
      'answers with is a promise to an agent, and one only the CLI keeps is one nothing can rely on.');
  }
  if (mcpHas && !cliHas) {
    fail(`The tool \`${tool}\` takes \`document\` and \`archboard ${entry}\` does not.`);
  }
  if (!cliHas && !mcpHas) {
    fail(`Neither \`archboard ${entry}\` nor \`${tool}\` offers the whole document. TASK-075 put ` +
      'it on both; if it is being taken off, take it off both and drop the pair here.');
  }
  if (cliHas && !synopsisOf(entry).includes('--document')) {
    fail(`\`archboard ${entry}\` takes --document and its usage synopsis does not mention it, so ` +
      '`archboard help` — the only place a shell agent would find it — does not say it exists.');
  }
  // Off by default is the whole point, so the description has to say why.
  const why = String(declared.inputSchema?.properties?.document?.description ?? '');
  if (mcpHas && !/default/i.test(why)) {
    fail(`The tool \`${tool}\` offers \`document\` without its description saying it is off by ` +
      'default and why. A flag whose cost is invisible needs the cost written down.');
  }
}
// --- saying what a write is doing, on both surfaces --------------------------
//
// `--doing` is the second promise that is not a command (TASK-095): an agent
// must say what it is doing on every board write, and a requirement only one
// surface makes is a requirement an agent learns to ignore. The two halves are
// shaped differently and both are read from the code — MCP declares it per tool
// in the schema, the CLI takes it globally in `run.ts` because one command can
// make several requests and they are all the same act.

const DOING_TOOLS = [
  'create_element', 'update_element', 'delete_element', 'batch_create_elements',
  'clear_canvas', 'import_scene', 'create_from_mermaid', 'insert_library_item',
  'group_elements', 'ungroup_elements', 'align_elements', 'distribute_elements',
  'lock_elements', 'unlock_elements', 'duplicate_elements',
  'restore_snapshot', 'save_board', 'promote_selection', 'demote_selection'
];

for (const name of DOING_TOOLS) {
  const declared = tools.find(tool => tool.name === name);
  if (!declared) {
    fail(`DOING_TOOLS names \`${name}\`, which mcp-tools.ts no longer declares.`);
    continue;
  }
  const schema = declared.inputSchema ?? {};
  if (!schema.properties?.doing) {
    fail(`The tool \`${name}\` writes a board and does not take \`doing\`. An agent that can change ` +
      'somebody\'s board without saying what it is doing is the thing TASK-095 exists to stop.');
    continue;
  }
  if (!(schema.required ?? []).includes('doing')) {
    fail(`The tool \`${name}\` takes \`doing\` and does not require it. Optional means half the ` +
      'callers will not pass it, and the canvas refuses those writes anyway — the schema should say so first.');
  }
  const why = String(schema.properties.doing.description ?? '');
  if (!/one short line|present tense/i.test(why) || !/never/i.test(why)) {
    fail(`The tool \`${name}\` requires \`doing\` without its description saying what shape the line ` +
      'takes or that it never reaches the board. A required field needs to say what it wants.');
  }
}

// A write tool that nobody listed. The list above is the same one mcp-tools.ts
// applies, restated here so that adding a write tool fails this check until
// somebody decides whether it says what it is doing.
for (const tool of tools) {
  const required = tool.inputSchema?.required ?? [];
  if (required.includes('doing') && !DOING_TOOLS.includes(tool.name)) {
    fail(`The tool \`${tool.name}\` requires \`doing\` and is not in DOING_TOOLS here — add it, so ` +
      'the two lists cannot drift.');
  }
}

// The CLI half is asked, not read, for the same reason `--document` is: the
// parser is the only witness that cannot be fooled by a paragraph mentioning
// the flag. `--doing` is stripped by run.ts before any command's parser sees
// it, so a command that gets as far as rejecting the nonsense flag has it.
{
  const run = spawnSync(process.execPath,
    [join(repoRoot, 'src', 'bin.ts'), 'add', '--doing', 'checking the flag exists', '--not-a-real-flag'],
    { encoding: 'utf8', env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: '1' }, timeout: 20000 });
  const said = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (said.includes('Unknown flag --doing')) {
    fail('`archboard --doing` is rejected by the command parser, so it is not global any more. ' +
      'It is stripped in run.ts alongside --board, because one command can make several requests.');
  } else if (!said.includes('Unknown flag --not-a-real-flag')) {
    fail(`\`archboard add --doing … --not-a-real-flag\` answered something this check cannot read — ` +
      `"${said.trim().split('\n')[0] ?? '(said nothing)'}".`);
  }
  const help = spawnSync(process.execPath, [join(repoRoot, 'src', 'bin.ts'), 'help'],
    { encoding: 'utf8', env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: '1' }, timeout: 20000 });
  if (!(help.stdout ?? '').includes('--doing')) {
    fail('`archboard help` does not mention --doing, and it is where a shell agent finds out a ' +
      'global flag exists. --board is written down there; a required flag it will be refused ' +
      'without has at least as much claim to the space.');
  }
}

// The cheatsheet's MCP section, held against the real tool list.
const cheatsheet = fs.readFileSync(CHEATSHEET, 'utf8');
const section = cheatsheet.split('\n## MCP Tools')[1]?.split('\n## ')[0] ?? '';
if (!section) {
  fail(`${CHEATSHEET} has no "## MCP Tools" section to check.`);
} else {
  const documented = new Set(
    [...section.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)].map(match => match[1])
  );
  for (const tool of toolNames) {
    if (!documented.has(tool)) {
      fail(`Tool \`${tool}\` is missing from the MCP table in skills/excalidraw-skill/references/cheatsheet.md — the one place a shell-less client learns the tool names.`);
    }
  }
  for (const name of documented) {
    if (!toolNames.has(name)) {
      fail(`The cheatsheet's MCP table documents \`${name}\`, which is not a tool.`);
    }
  }

  // And the required params it lists, for the writes. The table's last column
  // is what an MCP client reads instead of `archboard help`, so a required
  // argument missing from it is an argument that reader does not know about —
  // and the name check above cannot see a column (TASK-093, TASK-095).
  for (const name of DOING_TOOLS) {
    const row = section.split('\n').find(line => line.startsWith(`| \`${name}\` |`));
    if (!row) {
      fail(`The cheatsheet's MCP table has no row for \`${name}\`.`);
    } else if (!/`doing`/.test(row.split('|').at(-2) ?? '')) {
      fail(`The cheatsheet lists \`${name}\`'s required params without \`doing\`, which the tool ` +
        'requires. That column is where a shell-less client finds out, and it is the one place ' +
        'the tool-name check cannot look.');
    }
  }
}

// --- report ------------------------------------------------------------------

if (failures.length > 0) {
  console.error('surface parity: the CLI and the MCP surface have drifted.\n');
  for (const message of failures) console.error(`FAIL: ${message}`);
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}. Both surfaces are defined in src/core/mcp-tools.ts and src/cli/run.ts; the mapping is in ${'scripts/check-surface-parity.mjs'}.`);
  process.exit(1);
}

console.log(
  `surface parity: ${toolNames.size} MCP tools against ${cliEntries.size} CLI entries — ` +
  `${PAIRS.length} paired, ${Object.keys(CLI_ONLY).length} CLI-only, ${Object.keys(MCP_ONLY).length} MCP-only.`
);
for (const [entry, reason] of Object.entries(CLI_ONLY)) {
  console.log(`  CLI only  "${entry}" — ${reason}`);
}
for (const [tool, reason] of Object.entries(MCP_ONLY)) {
  console.log(`  MCP only  \`${tool}\` — ${reason}`);
}
