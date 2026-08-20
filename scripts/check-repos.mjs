#!/usr/bin/env node
//
// A binding names a repository, not a directory (TASK-031, ADR 0010).
//
// Two halves, and the second is the one that matters:
//
//   the rules      what a path is resolved against, in order of how firmly the
//                  caller named it, and what happens on a surface where there
//                  is nothing ambient to fall back to
//   the session    two throwaway repositories, one board, both promoted from a
//                  third directory that is neither of them and with no `cd`
//                  between them, which is the cross-repo case a naming
//                  convention cannot rescue
//
// Everything here runs against a registry in a temp file (ARCHBOARD_REPOS), so
// the machine's real one is never touched.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = p => path.join(repoRoot, 'dist', p);

let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${label}${extra ? ` (${extra})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archboard-repos-'));
const registry = path.join(scratch, 'repos.json');
process.env.ARCHBOARD_REPOS = registry;

// A directory that is not a git repository and never becomes one: everything
// resolved "from nowhere in particular" is run from here, so a path that only
// resolves because of where the caller stood cannot pass by accident.
const nowhere = path.join(scratch, 'nowhere');
fs.mkdirSync(nowhere);

function makeRepo(name, origin) {
  const root = path.join(scratch, name);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  // The same relative path in both repos: this is the trap an ambient working
  // directory falls into, so both sides of it have to exist.
  fs.writeFileSync(path.join(root, 'src', 'service.ts'), `export const which = '${name}';\n`);
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['remote', 'add', 'origin', origin]);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.']);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return root;
}

const alphaRoot = makeRepo('alpha', 'git@github.com:acme/alpha.git');
const betaRoot = makeRepo('beta', 'https://github.com/acme/beta.git');
const ALPHA = 'github.com/acme/alpha';
const BETA = 'github.com/acme/beta';

const { resolveBinding, PromotionError } = await import(dist('core/promote.js'));
const { declareRepo, checkoutFor, listRepos, forgetRepo, registryPath } =
  await import(dist('core/repo-registry.js'));

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

check('the registry is a machine-local file, overridable per process', registryPath() === registry);
check('and starts empty', listRepos().length === 0);

const declared = declareRepo(alphaRoot);
check('`repo add` takes the identity from git, not from the caller', declared.repo === ALPHA);
check('  and remembers where the checkout is', checkoutFor(ALPHA) === alphaRoot);
check('  as a declared entry, not a guess', listRepos()[0]?.source === 'declared');

let refusedAdd = null;
try { declareRepo(nowhere); } catch (error) { refusedAdd = error; }
check('a directory that is not a repository cannot be registered',
  /not inside a git repository/.test(refusedAdd?.message ?? ''));

// ---------------------------------------------------------------------------
// What a path resolves against
// ---------------------------------------------------------------------------

const MCP = { kind: 'none', surface: 'MCP' };
const from = dir => ({ kind: 'cwd', dir });

{
  // AC2: MCP has no working directory anybody can set, so a relative path
  // cannot resolve by intent there, only by accident.
  let refused = null;
  try { resolveBinding({ path: 'src/service.ts' }, MCP); } catch (error) { refused = error; }
  check('a relative path with no repo is refused where there is no working directory',
    refused instanceof PromotionError);
  check('  and the refusal says why this surface has none',
    /no working directory to resolve it against/.test(refused?.message ?? ''));
  check('  and names both ways out: an absolute path, or a repository',
    /absolute path/.test(refused?.message ?? '') && /repository/.test(refused?.message ?? ''));
  check('  and lists what is registered here, so the next step is on screen',
    refused?.message?.includes(ALPHA));
}

{
  // AC2 again, the other half: the same surface binds fine when the caller
  // names the file outright.
  const absolute = resolveBinding({ path: path.join(betaRoot, 'src/service.ts') }, MCP);
  check('an absolute path binds over MCP with no working directory at all', absolute.resolved);
  check('  to the repository that path is actually in', absolute.address.repo === BETA);
  check('  recorded repo-relative, so the address travels', absolute.address.path === 'src/service.ts');
  check('  and says what it resolved against', absolute.resolvedFrom === 'path');
  check('  with a link, because the file is here', absolute.link?.endsWith('/src/service.ts') === true);
  check('  and the branch and commit it was confirmed at',
    absolute.address.branch === 'main' && /^[0-9a-f]{40}$/.test(absolute.address.commit ?? ''));

  // Learning: beta was never declared, but archboard just saw it.
  check('a binding that resolved through a real path teaches the registry where that repo is',
    checkoutFor(BETA) === betaRoot);
  check('  as an observation, distinguishable from something a person declared',
    listRepos().find(entry => entry.repo === BETA)?.source === 'observed');
}

{
  // AC3: name the repo, resolve without standing in it, over MCP, from a
  // directory that is not a repository at all.
  const named = resolveBinding({ path: 'src/service.ts', repo: BETA }, MCP);
  check('naming a repository resolves a relative path with no cwd in sight', named.resolved);
  check('  through the registry', named.resolvedFrom === 'registry');
  check('  to that repository', named.address.repo === BETA);
  check('  with a link into the right checkout', named.link === `file://${betaRoot}/src/service.ts`);
}

{
  // AC1: the trap. Standing in alpha, a bare relative path lands in alpha, and
  // the answer says so, because alpha is the thing the caller did not name.
  const ambient = resolveBinding({ path: 'src/service.ts' }, from(alphaRoot));
  check('a bare relative path still resolves where the caller is standing', ambient.resolved);
  check('  and the answer says it used the working directory', ambient.resolvedFrom === 'cwd');
  check('  naming the directory it used', ambient.note?.includes(alphaRoot));
  check('  and the repository that turned out to be', ambient.note?.includes(ALPHA));
  check('  so it cannot pass for something the caller named',
    /You named no repository/.test(ambient.note ?? ''));

  // The same command, the same directory, a different repository, because this
  // one was named.
  const named = resolveBinding({ path: 'src/service.ts', repo: BETA }, from(alphaRoot));
  check('naming a repo beats the directory the caller happens to be in',
    named.address.repo === BETA && named.link === `file://${betaRoot}/src/service.ts`);
}

{
  const unknown = resolveBinding({ path: 'src/service.ts', repo: 'github.com/acme/never-cloned' }, MCP);
  check('a repository nobody has here is not resolved against something else', !unknown.resolved);
  check('  the address is still recorded, because it is a statement of intent',
    unknown.address.repo === 'github.com/acme/never-cloned' && unknown.address.path === 'src/service.ts');
  check('  with no link, because there is nothing here to open', unknown.link === undefined);
  check('  and it says how to make it resolvable', /repo add/.test(unknown.note ?? ''));
}

{
  // A registry entry whose checkout has become some other repository. Resolving
  // through it would bind to a real file in the wrong repo, which is exactly
  // the failure this whole task is about.
  fs.writeFileSync(registry, JSON.stringify([
    { repo: 'github.com/acme/moved', root: betaRoot, source: 'declared', addedAt: new Date().toISOString() }
  ], null, 2));
  const stale = resolveBinding({ path: 'src/service.ts', repo: 'github.com/acme/moved' }, MCP);
  check('a registered checkout that is now a different repository binds to nothing', !stale.resolved);
  check('  and says which repository is actually there', stale.note?.includes(BETA));
  check('  with no link to the wrong file', stale.link === undefined);

  forgetRepo('github.com/acme/moved');
  check('an entry can be forgotten', checkoutFor('github.com/acme/moved') === undefined);
}

{
  const missing = resolveBinding({ path: 'src/nope.ts' }, from(alphaRoot));
  check('a path that does not exist yet still gets an address, because a proposal is a real binding',
    missing.resolved && missing.address.repo === ALPHA);
  check('  but no link, because there is nothing to open', missing.link === undefined);

  const nonsense = resolveBinding({ path: 'src/service.ts' }, from(nowhere));
  check('a relative path outside any repository fails visibly', !nonsense.resolved);
  check('  and names the directory it looked in', nonsense.note?.includes(nowhere));
}

// ---------------------------------------------------------------------------
// One board, two repositories, one session, no cd (AC4)
// ---------------------------------------------------------------------------

declareRepo(alphaRoot);
declareRepo(betaRoot);

const PORT = 34000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}`;
const vault = path.join(scratch, 'vault');
fs.mkdirSync(vault);

const server = spawn(process.execPath, [dist('server.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ARCHBOARD_VAULT: vault,
    ARCHBOARD_REPOS: registry,
    LOG_LEVEL: 'error'
  },
  stdio: ['ignore', 'ignore', 'pipe']
});
let serverStderr = '';
server.stderr.on('data', chunk => { serverStderr += chunk.toString(); });

const api = async (method, url, body) => {
  const response = await fetch(`${base}${url}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// The CLI, run from a directory that is neither repository. The point is that
// where it runs from stops mattering once the repo is named.
const cli = (args, cwd = nowhere) => {
  // Both streams, always: the CLI puts results on stdout and everything it
  // wants a human to notice on stderr, and several checks here are about what
  // it says rather than what it returns.
  const run = spawnSync(process.execPath, [dist('bin.js'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      EXPRESS_SERVER_URL: base,
      ARCHBOARD_REPOS: registry,
      EXCALIDRAW_NO_AUTOSTART: '1'
    }
  });
  return { ok: run.status === 0, out: run.stdout ?? '', err: run.stderr ?? '' };
};

try {
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/health`); break; } catch { await sleep(100); }
  }

  const board = 'systems';
  await api('POST', '/api/boards/new', { board, level: 'system' });
  const alphaBox = await api('POST', `/api/elements?board=${board}`,
    { type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'Alpha' } });
  const betaBox = await api('POST', `/api/elements?board=${board}`,
    { type: 'rectangle', x: 300, y: 0, width: 200, height: 80, label: { text: 'Beta' } });
  const alphaId = alphaBox.body?.element?.id ?? alphaBox.body?.id;
  const betaId = betaBox.body?.element?.id ?? betaBox.body?.id;
  check('two boxes on one board', Boolean(alphaId && betaId));

  const first = cli(['promote', '--board', board, '--ids', alphaId, '--kind', 'service',
    '--repo', ALPHA, '--path', 'src/service.ts']);
  const second = cli(['promote', '--board', board, '--ids', betaId, '--kind', 'service',
    '--repo', BETA, '--path', 'src/service.ts']);
  check('a node in one repo is promoted from outside it', first.ok, first.err);
  check('and a node in another repo, from the same directory, with no cd', second.ok, second.err);

  const elements = (await api('GET', `/api/elements?board=${board}`)).body?.elements ?? [];
  const bindingOf = id => elements.find(el => el.id === id)?.customData?.archboard?.binding;
  check('the two nodes on one board name two different repositories',
    bindingOf(alphaId)?.repo === ALPHA && bindingOf(betaId)?.repo === BETA,
    `${bindingOf(alphaId)?.repo} / ${bindingOf(betaId)?.repo}`);
  check('  each with the same repo-relative path, and no confusion between them',
    bindingOf(alphaId)?.path === 'src/service.ts' && bindingOf(betaId)?.path === 'src/service.ts');
  check('  and each links to its own checkout, so the box is tappable on the Flip',
    elements.find(el => el.id === alphaId)?.link === `file://${alphaRoot}/src/service.ts` &&
    elements.find(el => el.id === betaId)?.link === `file://${betaRoot}/src/service.ts`);
  check('  neither of which is where the promotions were run from',
    !first.out.includes(nowhere) && !second.out.includes(nowhere));

  // The trap, end to end: the same relative path with no repo named, run from
  // the directory that is not a repository, must not invent a binding.
  const blind = cli(['promote', '--board', board, '--ids', betaId, '--kind', 'service',
    '--path', 'src/service.ts']);
  check('the same call with no repo named binds to nothing from a directory that is not one',
    blind.ok && /does not resolve on this machine/.test(blind.out));

  // --- the surface with no working directory to speak of -------------------
  //
  // The MCP server is spawned INSIDE alpha, which is the trap: alpha holds a
  // real src/service.ts, so an ambient cwd would resolve, confidently and by
  // accident, to whichever directory the client happened to start the server
  // in. Nobody chose that directory and nobody can see it.

  const mcp = (tool, args, cwd) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dist('index.js')], {
      cwd,
      env: {
        ...process.env,
        EXPRESS_SERVER_URL: base,
        ARCHBOARD_REPOS: registry,
        EXCALIDRAW_NO_AUTOSTART: '1',
        LOG_LEVEL: 'error'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('MCP timed out')); }, 20000);
    child.stdout.on('data', chunk => {
      out += chunk.toString();
      const lines = out.split('\n');
      out = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        clearTimeout(timer);
        child.kill('SIGKILL');
        resolve(JSON.parse(line));
        return;
      }
    });
    child.on('error', reject);
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': { name: 'archboard-repo-test', version: '0.0.0' }
        }
      }
    }) + '\n');
  });

  const ambientMcp = await mcp(
    'promote_selection',
    { board, elementIds: [alphaId], kind: 'service', path: 'src/service.ts' },
    alphaRoot
  );
  const ambientText = JSON.stringify(ambientMcp.result?.content ?? ambientMcp.error ?? {});
  check('over MCP, a relative path is refused even when the server process sits in a repo that has it',
    /no working directory to resolve it against/.test(ambientText), ambientText.slice(0, 160));

  const namedMcp = await mcp(
    'promote_selection',
    { board, elementIds: [betaId], kind: 'service', path: 'src/service.ts', repo: BETA },
    alphaRoot
  );
  const namedText = JSON.stringify(namedMcp.result?.content ?? namedMcp.error ?? {});
  check('  and naming the repository binds from the same process, to the repository named',
    namedText.includes(BETA) && !namedText.includes(`${ALPHA}:src`), namedText.slice(0, 160));

  const listed = cli(['repo', 'list', '--text']);
  check('`repo list` says what can be named from anywhere',
    listed.out.includes(ALPHA) && listed.out.includes(BETA));

  // -------------------------------------------------------------------------
  // Which boards describe this repository (TASK-030)
  // -------------------------------------------------------------------------
  //
  // The board built above is exactly the hard case: it spans two repositories
  // and is named after neither, so no naming convention could find it.

  const saved = await api('POST', `/api/boards/save?board=${board}`);
  check('the cross-repo board saves to the vault', saved.status === 200, JSON.stringify(saved.body).slice(0, 120));

  const fromAlpha = cli(['board', 'list', '--repo', ALPHA, '--text']);
  const fromBeta = cli(['board', 'list', '--repo', BETA, '--text']);
  check('a board is found from a repository it has a node in', fromAlpha.out.includes('systems'), fromAlpha.err);
  check('  and from the other repository on the same board', fromBeta.out.includes('systems'), fromBeta.err);
  check('  listing the node that matched, not just the board name',
    /Alpha \[service\] -> src\/service\.ts/.test(fromAlpha.out), fromAlpha.out);
  check('  and only that repository\'s nodes', !/Beta \[/.test(fromAlpha.out), fromAlpha.out);
  check('  with the command to open it', /board open systems/.test(fromAlpha.out));

  const fromStranger = cli(['board', 'list', '--repo', 'github.com/acme/stranger', '--text']);
  check('a repository nothing describes gets a plain no', /No board/.test(fromStranger.out), fromStranger.out);
  check('  which says how many boards were read, so it is not mistaken for an empty vault',
    /board\(s\) read/.test(fromStranger.out));

  // The question an agent actually asks: it is standing somewhere and does not
  // know what covers it.
  const here = cli(['board', 'list', '--here', '--text'], alphaRoot);
  check('an agent standing in a repo finds its boards without being told which',
    here.out.includes('systems'), here.err);
  check('  and is told which repository that directory turned out to be',
    here.err.includes(ALPHA), here.err);

  const notARepo = cli(['board', 'list', '--here', '--text'], nowhere);
  check('--here outside a repository is a usage error, not an empty answer',
    !notARepo.ok && /not inside a git repository/.test(notARepo.err));

  // Unsaved work counts: a board open on the canvas is read from memory.
  await api('POST', '/api/boards/new', { board: 'drafts' });
  const draftBox = await api('POST', '/api/elements?board=drafts',
    { type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'Draft' } });
  const draftId = draftBox.body?.element?.id ?? draftBox.body?.id;
  cli(['promote', '--board', 'drafts', '--ids', draftId, '--kind', 'service',
    '--repo', ALPHA, '--path', 'src/service.ts']);
  const withDraft = cli(['board', 'list', '--repo', ALPHA]);
  const draftEntry = JSON.parse(withDraft.out).boards.find(b => b.key === 'drafts');
  check('a board open on the canvas but never saved is still an answer', Boolean(draftEntry), withDraft.out.slice(0, 200));
  check('  and says it came from memory rather than a note', draftEntry?.source === 'memory');

  // The vault half on its own, with nothing open, which is what another
  // machine's canvas would see.
  const { boardsForRepo } = await import(dist('core/repo-boards.js'));
  const fromVault = boardsForRepo(ALPHA, [], vault);
  check('the same board is found by reading the vault alone',
    fromVault.boards.some(b => b.key === 'systems' && b.source === 'vault'),
    JSON.stringify(fromVault.boards.map(b => b.key)));
  check('  with the binding read back out of the note',
    fromVault.boards.find(b => b.key === 'systems')?.nodes?.[0]?.path === 'src/service.ts');

  const mcpBoards = await mcp('list_boards', { repo: BETA }, alphaRoot);
  const mcpText = mcpBoards.result?.content?.[0]?.text ?? '';
  check('a shell-less client can ask the same question by naming the repository',
    mcpText.includes('systems') && mcpText.includes(BETA), mcpText.slice(0, 160));
} finally {
  server.kill('SIGTERM');
  await sleep(200);
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nrepos: ${failures} check(s) failed.`);
  if (serverStderr.trim()) console.error(serverStderr.trim().split('\n').slice(-10).join('\n'));
  process.exit(1);
}
console.log('\nrepos: all checks passed.');
