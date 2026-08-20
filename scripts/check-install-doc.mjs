#!/usr/bin/env node

// Installing the skill has to leave the next agent a repo it can work in.
//
// The skill teaches the commands; it cannot know where this machine keeps its
// vault, or that `archboard` is not on PATH here. Those go into the repo's own
// CLAUDE.md or AGENTS.md, and getting that wrong is quiet: a second copy of the
// block appended on every re-install, or a CLAUDE.md created next to an
// AGENTS.md so two agent docs disagree. Both are checked here, against the real
// CLI running as a child process in throwaway repos under a temp dir.

import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const bin = join(repoRoot, 'dist', 'bin.js');

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (condition) return;
  failures++;
  console.error(`FAIL: ${message}`);
}

const scratch = fs.mkdtempSync(join(os.tmpdir(), 'archboard-install-'));
const skillsRoot = join(scratch, 'skills');

// Every run installs into a throwaway skills root, never the machine's own.
function install(repo, extra = []) {
  const stdout = execFileSync('node', [bin, 'install-skill', '--dir', skillsRoot, '--repo', repo, ...extra], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // A vault in the environment is somebody having already answered the
    // question; these cases are about what happens when nobody has.
    env: { ...process.env, ARCHBOARD_VAULT: '' }
  });
  return JSON.parse(stdout);
}

function makeRepo(name, files = {}) {
  const repo = join(scratch, name);
  fs.mkdirSync(repo, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    fs.writeFileSync(join(repo, file), contents, 'utf-8');
  }
  return repo;
}

const BEGIN = '<!-- archboard:begin -->';

// ─── Which doc a repo with neither gets ──────────────────────
//
// Through the CLI these cases all pass --dir, so as not to write into the
// machine's own ~/.claude/skills; that makes the target agent-neutral and the
// created doc AGENTS.md. The `--target claude` branch is checked directly,
// since exercising it end to end would mean installing for real.

{
  const { chooseDoc } = await import(join(repoRoot, 'dist', 'cli', 'commands', 'install-skill.js'));
  const empty = makeRepo('choose');
  assert(chooseDoc(empty, 'claude').file === join(empty, 'CLAUDE.md'), 'installing for claude should create CLAUDE.md');
  assert(chooseDoc(empty, 'codex').file === join(empty, 'AGENTS.md'), 'installing for codex should create AGENTS.md');
  assert(chooseDoc(empty, 'claude').existed === false, 'chooseDoc claimed a file that is not there');
}

// ─── A repo with no agent doc at all ─────────────────────────

{
  const repo = makeRepo('fresh');
  const result = install(repo);
  const doc = join(repo, 'AGENTS.md');

  assert(result.setup.doc === doc, `an agent-neutral install should write AGENTS.md, wrote ${result.setup.doc}`);
  assert(result.setup.docCreated === true, 'a repo with no agent doc should get one');
  assert(!fs.existsSync(join(repo, 'CLAUDE.md')), 'CLAUDE.md was created alongside AGENTS.md');

  const text = fs.readFileSync(doc, 'utf-8');
  assert(text.includes('ARCHBOARD_VAULT'), 'the doc does not name ARCHBOARD_VAULT');
  assert(text.includes(result.setup.vault), 'the doc does not carry the vault path');
  assert(text.includes(result.setup.command), 'the doc does not say how to invoke the CLI');
  assert(/Boards for this repo/.test(text), 'the doc has no place for project conventions');

  // The vault has to exist, or the first board command fails on a path.
  assert(result.setup.vault === join(repo, '.archboard', 'vault'), `assumed vault should be repo-local, got ${result.setup.vault}`);
  assert(result.setup.vaultCreated === true && fs.existsSync(result.setup.vault), 'the vault directory was not created');
}

// ─── The same repo, installed into twice ─────────────────────

{
  const repo = makeRepo('twice');
  install(repo);
  const first = fs.readFileSync(join(repo, 'AGENTS.md'), 'utf-8');
  const second = install(repo);
  const text = fs.readFileSync(join(repo, 'AGENTS.md'), 'utf-8');

  assert(second.setup.blockUpdated === true, 'a re-install did not notice the block it had already written');
  assert(second.setup.docCreated === false, 'a re-install claimed to create a doc that existed');
  assert(text.split(BEGIN).length - 1 === 1, 're-installing appended a second block');
  assert(text === first, 're-installing changed the block it rewrote');
}

// ─── Prose around the block survives ─────────────────────────

{
  const repo = makeRepo('prose', { 'CLAUDE.md': '# House rules\n\nRun the tests.\n' });
  install(repo);
  const text = fs.readFileSync(join(repo, 'CLAUDE.md'), 'utf-8');
  assert(text.startsWith('# House rules\n\nRun the tests.\n'), 'the existing doc was overwritten rather than appended to');
  assert(text.includes(BEGIN), 'the block was not added to the existing doc');

  // A human's own notes inside the block are the one part re-running loses;
  // everything they wrote outside it must not move.
  fs.appendFileSync(join(repo, 'CLAUDE.md'), '\n## Afterwards\n\nStill here.\n', 'utf-8');
  install(repo);
  const again = fs.readFileSync(join(repo, 'CLAUDE.md'), 'utf-8');
  assert(again.startsWith('# House rules'), 'a re-install lost the prose before the block');
  assert(again.includes('## Afterwards'), 'a re-install lost the prose after the block');
  assert(again.split(BEGIN).length - 1 === 1, 'a re-install with trailing prose left two blocks');
}

// ─── An existing AGENTS.md is the doc, and stays the only one ─

{
  const repo = makeRepo('agents', { 'AGENTS.md': '# Agents\n' });
  const result = install(repo);
  assert(result.setup.doc === join(repo, 'AGENTS.md'), 'an existing AGENTS.md should be the doc that gets the block');
  assert(!fs.existsSync(join(repo, 'CLAUDE.md')), 'CLAUDE.md was created next to an existing AGENTS.md');
}

// ─── CLAUDE.md wins when both exist ──────────────────────────

{
  const repo = makeRepo('both', { 'CLAUDE.md': '# Claude\n', 'AGENTS.md': '# Agents\n' });
  const result = install(repo);
  assert(result.setup.doc === join(repo, 'CLAUDE.md'), 'CLAUDE.md should win when both docs exist');
  assert(!fs.readFileSync(join(repo, 'AGENTS.md'), 'utf-8').includes(BEGIN), 'the block went into both docs');
}

// ─── Named answers, and no answer at all ─────────────────────

{
  const repo = makeRepo('named');
  const vault = join(scratch, 'shared-vault');
  const result = install(repo, ['--vault', vault, '--doc', join(repo, 'docs', 'AGENTS.md')]);
  assert(result.setup.vault === vault, '--vault was not honoured');
  assert(fs.existsSync(vault), '--vault did not create the vault');
  assert(fs.existsSync(join(repo, 'docs', 'AGENTS.md')), '--doc did not write where it was told');
  assert(!fs.existsSync(join(repo, 'CLAUDE.md')), '--doc still created a doc at the repo root');
}

{
  const repo = makeRepo('untouched');
  const result = install(repo, ['--no-doc']);
  assert(result.setup === undefined, '--no-doc still reported a setup');
  assert(fs.readdirSync(repo).length === 0, '--no-doc wrote into the repo anyway');
  assert(fs.existsSync(join(skillsRoot, 'excalidraw-skill', 'SKILL.md')), '--no-doc skipped the skill install too');
}

// ─── An environment that has already answered ────────────────

{
  const repo = makeRepo('env');
  const vault = join(scratch, 'cross-repo-vault');
  const stdout = execFileSync('node', [bin, 'install-skill', '--dir', skillsRoot, '--repo', repo], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ARCHBOARD_VAULT: vault }
  });
  const result = JSON.parse(stdout);
  assert(result.setup.vault === vault, 'ARCHBOARD_VAULT in the environment was ignored in favour of a local vault');
}

fs.rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} of ${checks} install-doc checks failed`);
  process.exit(1);
}
console.log(`install-doc: ${checks} checks passed`);
