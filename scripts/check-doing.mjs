#!/usr/bin/env bun

// An agent says what it is doing, and the wall shows it (TASK-095).
//
// The other half of the principle the rest of this repository keeps arriving
// at: a creator needs an immediate connection to what they are creating, and on
// this canvas the creator is both the person and the agent. Seeing *what*
// changed is the half already built — the server is the truth, a write returns
// the document, the board reports what it became. This is the other half:
// knowing what the agent thinks it is doing while it does it, rather than
// watching boxes move and inferring it afterwards.
//
// Five things have to hold, and each is a way the feature could be quietly
// worthless rather than a way it could throw:
//
//   1. a write that says nothing is REFUSED, on all three surfaces, with
//      nothing written — being made to write the sentence is the point
//   2. it NEVER reaches the note, proved by saving and reading the file
//   3. it is broadcast board-scoped, so a pane holding the other board does not
//      hear it, and a pane that arrives late is told the last few
//   4. a person's own change report carries none and is not made to invent one
//   5. the list is short and the line is bounded, so a wall shows one-liners
//      and not a log
//
// The sixth — that a description reaches a live model without an agent
// narrating its own drawing back at itself (ADR 0005) — is in
// `check-changes.mjs`, beside the stub daemon that owns injection.
//
// The refusal is proved here and nowhere else: every other check hands its
// writes a line through `scripts/lib/doing.mjs`, so this is the one place that
// asks without saying anything.

import fs from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => join(repoRoot, 'src', p);

let failures = 0;
let checks = 0;
const check = (label, condition, extra = '') => {
  checks += 1;
  if (!condition) failures += 1;
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
  return condition;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PORT = 39800 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-doing-'));

const server = spawn(process.execPath, [src('server.ts')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'ignore']
});

// Deliberately raw: this is the one check that must be able to write without
// saying anything, so nothing here attaches a line on the caller's behalf.
const api = async (method, url, body) => {
  const response = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const cli = (args) => spawnSync(process.execPath, [src('bin.ts'), ...args], {
  encoding: 'utf-8',
  input: '',
  env: {
    ...process.env,
    EXPRESS_SERVER_URL: base,
    EXCALIDRAW_NO_AUTOSTART: '1',
    ARCHBOARD_VAULT: vault,
    LOG_LEVEL: 'error'
  }
});

const box = (id, x = 10) => ({ id, type: 'rectangle', x, y: 10, width: 60, height: 40 });
const said = (doing) => `doing=${encodeURIComponent(doing)}`;

const up = async () => {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return true; } catch { /* not yet */ }
    await sleep(100);
  }
  return false;
};

try {
  if (!check('the canvas comes up', await up())) throw new Error('no canvas');
  await api('POST', '/api/boards/new', { board: 'payments' });

  // ─── 1. A write that says nothing is refused ─────────────────

  const silent = await api('POST', '/api/elements?board=payments', box('a'));
  check('a write that says nothing about what it is doing is refused',
    silent.status === 400, `${silent.status}`);
  check('  with a code a caller can act on', silent.body?.code === 'DOING_REQUIRED',
    String(silent.body?.code));
  check('  naming all three surfaces, because the caller could be on any of them',
    /--doing/.test(silent.body?.error ?? '') && /`doing`/.test(silent.body?.error ?? '') &&
    /\?doing=/.test(silent.body?.error ?? ''));
  check('  and saying a claim\'s reason does not stand in for it',
    /campaign/.test(silent.body?.error ?? '') && /step/.test(silent.body?.error ?? ''));
  check('  with nothing written',
    (await api('GET', '/api/elements?board=payments')).body?.count === 0);

  const empty = await api('POST', `/api/elements?board=payments&${said('   ')}`, box('a'));
  check('a line of whitespace is not a line', empty.status === 400, `${empty.status}`);

  const long = await api('POST', `/api/elements?board=payments&${said('x'.repeat(141))}`, box('a'));
  check('and neither is a paragraph — this is read from two metres, not logged',
    long.status === 400 && /140/.test(long.body?.error ?? ''), `${long.status}`);

  // Every route the write boundary calls a board write, not just the obvious
  // one. The boundary is deny-by-default, so this is what stops a route added
  // later from being the one that got away with saying nothing.
  for (const [method, path, body] of [
    ['POST', '/api/elements/batch?board=payments', { elements: [box('b')] }],
    ['POST', '/api/elements/changes?board=payments', { origin: 'agent', upserts: [box('c')] }],
    ['PUT', '/api/elements/a?board=payments', { x: 5 }],
    ['DELETE', '/api/elements/clear?board=payments', undefined],
    ['POST', '/api/boards/save?board=payments', {}],
    ['POST', '/api/elements/from-mermaid?board=payments', { mermaidDiagram: 'graph TD; A-->B;' }]
  ]) {
    const refused = await api(method, path, body);
    check(`  ${method} ${path.split('?')[0]} is refused the same way`,
      refused.status === 400 && refused.body?.code === 'DOING_REQUIRED',
      `${refused.status} ${refused.body?.code ?? ''}`);
  }

  // The two other surfaces say it in their own words, and refuse in the same
  // place: the canvas. Neither keeps a second list of which commands write.
  const bareCli = cli(['add', '--board', 'payments', '--one', JSON.stringify(box('d'))]);
  check('the CLI is refused too, by the canvas rather than by a second list of write commands',
    bareCli.status !== 0 && /says nothing about what it is doing/.test(`${bareCli.stdout}${bareCli.stderr}`),
    `${bareCli.status} ${(bareCli.stderr ?? '').split('\n')[0]}`);
  const saidCli = cli(['add', '--board', 'payments', '--doing', 'adding a box from a shell',
    '--one', JSON.stringify(box('d', 800))]);
  check('  and goes through with --doing, which is global like --board', saidCli.status === 0,
    `${saidCli.status} ${(saidCli.stderr ?? '').split('\n')[0]}`);
  check('  and `archboard help` says the flag exists, which is where a shell agent looks',
    /--doing/.test(cli(['help']).stdout));

  const { tools } = await import(src('core/mcp-tools.ts'));
  const writeTools = tools.filter(tool => tool.inputSchema?.required?.includes('doing'));
  check('and MCP demands it in the schema, so a client is told before the round trip',
    writeTools.length >= 19, `${writeTools.length} tools`);
  check('  including every tool that changes a board',
    ['create_element', 'batch_create_elements', 'clear_canvas', 'save_board', 'promote_selection',
      'create_from_mermaid', 'import_scene', 'restore_snapshot', 'insert_library_item']
      .every(name => writeTools.some(tool => tool.name === name)));
  check('  and no tool that only reads one, because narrating a read is noise on a wall',
    !['describe_scene', 'query_elements', 'export_scene', 'get_element', 'snapshot_scene']
      .some(name => writeTools.some(tool => tool.name === name)));

  // ─── 2. And it lands when it is said ─────────────────────────

  const landed = await api('POST',
    `/api/elements?board=payments&${said('adding the payment queue')}`, box('a'));
  check('the same write lands once it says what it is doing',
    landed.status === 201 || landed.status === 200, `${landed.status}`);

  // ─── 3. It never reaches the note ────────────────────────────

  const saved = await api('POST', `/api/boards/save?board=payments&${said('writing the board down')}`, {});
  const note = saved.body?.file;
  check('the board saves', typeof note === 'string' && fs.existsSync(note), String(note));
  const bytes = fs.readFileSync(note, 'utf-8');
  check('and what an agent said is nowhere in the note it wrote',
    !bytes.includes('adding the payment queue') && !bytes.includes('writing the board down'));
  check('  nor is the field name, so nothing carried it in under another spelling',
    !/doing/.test(bytes));
  check('  while the element it was said about is in there',
    /"type": ?"rectangle"/.test(bytes));

  const element = (await api('GET', '/api/elements?board=payments')).body?.elements?.[0] ?? {};
  check('and the board hands the element back with no trace of it either',
    element.doing === undefined && !JSON.stringify(element).includes('adding the payment queue'),
    JSON.stringify(element).slice(0, 100));

  // ─── 4. The panes hear it, and only the ones holding that board ─

  const heard = { left: [], right: [] };
  const listen = async (name, clientId) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=${clientId}`);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'board_doing') heard[name].push(message);
    });
    await new Promise((resolve) => socket.on('open', resolve));
    return socket;
  };
  const registerPane = (clientId, x, primary) => api('POST', '/api/panes', {
    clientId, paneId: clientId, board: 'scratch', primary, focused: primary,
    elementCount: 0, rect: { x, y: 0, width: 640, height: 800 },
    viewport: { x, y: 0, width: 640, height: 800, zoom: 1 }
  });

  const left = await listen('left', 'pane-left');
  const right = await listen('right', 'pane-right');
  await registerPane('pane-left', 0, true);
  await registerPane('pane-right', 640, false);
  await api('POST', '/api/boards/open', { board: 'payments', pane: 'pane-left' });
  await sleep(250);
  heard.left = [];
  heard.right = [];

  await api('POST', `/api/elements?board=payments&${said('rerouting orders through it')}`, box('e', 200));
  await sleep(250);
  const news = heard.left.at(-1);
  check('the pane holding the board is told what was just done to it', heard.left.length === 1,
    `${heard.left.length} message(s)`);
  check('  in the writer\'s own words', news?.doing?.doing === 'rerouting orders through it',
    JSON.stringify(news?.doing));
  check('  named as the board it is about, like every other content message',
    news?.board === 'payments');
  check('  by an agent, and by which one, so two agents do not read as one',
    news?.doing?.kind === 'agent' && typeof news?.doing?.by === 'string' && news.doing.by.length > 0,
    JSON.stringify(news?.doing?.by));
  check('  and it carries the recent list, not only the new line',
    Array.isArray(news?.recent) && news.recent.length >= 1);
  // Board-scoped the way every other content message is: it goes out on the
  // socket and names the board it is about, and a pane holding a different one
  // drops it on that name. Same shape as board_lock and board_hold, so there
  // is one rule for whose news is whose rather than a second one here.
  check('the pane holding another board is sent it named as somebody else\'s board',
    heard.right.every(message => message.board === 'payments'),
    JSON.stringify(heard.right.map(message => message.board)));

  // A refused write narrates nothing: a wall that showed intentions rather than
  // acts would be a wall that lies.
  await api('POST', `/api/elements/xxx-not-here?board=payments&${said('updating a box that is gone')}`, { x: 1 });
  await sleep(200);
  check('a write that was refused says nothing on the wall',
    !heard.left.some(m => m.doing?.doing === 'updating a box that is gone'),
    JSON.stringify(heard.left.map(m => m.doing?.doing)));

  // ─── 5. A person's own change carries none ───────────────────

  heard.left = [];
  const human = await api('POST', '/api/elements/changes?board=payments', {
    clientId: 'pane-left',
    upserts: [{ id: 'drag', type: 'ellipse', x: 300, y: 300, width: 40, height: 40 }]
  });
  check('a person\'s own change report needs no line and is not refused', human.status === 200,
    `${human.status}`);
  await sleep(250);
  check('  and nothing invents one on their behalf', heard.left.length === 0,
    JSON.stringify(heard.left.map(m => m.doing?.doing)));

  // The shell's own buttons are the person's too, and neither carries a body to
  // put a pane id in — Clear is a DELETE and Save is a person pressing Save.
  const shellSave = await api('POST', '/api/boards/save?board=payments&clientId=pane-left', {});
  check('and so is Save in the shell, which says who pressed it in the query',
    shellSave.status === 200, `${shellSave.status}`);
  const shellClear = await api('DELETE', '/api/elements/clear?board=payments&clientId=pane-left');
  check('  and Clear, for the same reason', shellClear.status === 200, `${shellClear.status}`);

  // ─── 6. Short, and the last few ──────────────────────────────

  for (let i = 0; i < 7; i += 1) {
    await api('POST', `/api/elements?board=payments&${said(`step ${i}`)}`, box(`s${i}`, 400 + i * 20));
  }
  await sleep(250);
  const list = heard.left.at(-1)?.recent ?? [];
  check('the list is the last few actions, not a transcript', list.length === 5, `${list.length} kept`);
  check('  oldest first, so it reads in the order it happened',
    list[0]?.doing === 'step 2' && list.at(-1)?.doing === 'step 6',
    list.map(entry => entry.doing).join(' | '));

  // One intent can be several writes — `import` clears the board, batches the
  // scene in and posts its images — and it says the one thing the caller wrote
  // each time. Three lines of it would be three of the five spent on one act.
  for (let i = 0; i < 3; i += 1) {
    await api('POST', `/api/elements?board=payments&${said('restoring the payment path from the export')}`,
      box(`r${i}`, 600 + i * 20));
  }
  await sleep(250);
  const repeated = heard.left.at(-1)?.recent ?? [];
  check('one thing said three times running is one line, not three',
    repeated.filter(entry => entry.doing === 'restoring the payment path from the export').length === 1,
    repeated.map(entry => entry.doing).join(' | '));
  check('  and it is the newest line, so the list still reads in order',
    repeated.at(-1)?.doing === 'restoring the payment path from the export');

  // A pane arriving on a board an agent is part way through is not blank.
  const late = [];
  const arriving = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=pane-late`);
  arriving.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'board_doing') late.push(message);
  });
  await new Promise((resolve) => arriving.on('open', resolve));
  await registerPane('pane-late', 0, false);
  await api('POST', '/api/boards/open', { board: 'payments', pane: 'pane-late' });
  await sleep(300);
  check('a pane handed a board mid-campaign is told what has been happening on it',
    (late.at(-1)?.recent ?? []).length === 5,
    JSON.stringify((late.at(-1)?.recent ?? []).map(entry => entry.doing)));

  left.close();
  right.close();
  arriving.close();
} catch (error) {
  failures += 1;
  console.error(error);
} finally {
  server.kill('SIGKILL');
  fs.rmSync(vault, { recursive: true, force: true });
}

console.log(failures === 0
  ? `doing: ${checks} checks. An agent says what it is doing, the pane holding that board shows it, and the note never sees it.`
  : `doing: ${failures} of ${checks} checks failed.`);
process.exit(failures === 0 ? 0 : 1);
