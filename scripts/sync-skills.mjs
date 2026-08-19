#!/usr/bin/env node
// Sync this repo's authored skills into the agent directories.
//
// Two tracked sources, deliberately separate:
//
//   skills/       DISTRIBUTABLE. Published to npm (package.json `files`) and
//                 installed by consumers via `mcp-excalidraw-server
//                 install-skill`. Must stay portable — no machine-specific
//                 paths.
//   dev-skills/   REPO-LOCAL. Skills for working *on* this repo. Tracked, but
//                 never published. May reference repo paths like bin/canvas.
//
// Both sync into .agents/skills/<name>, which .claude/skills/<name> symlinks
// to. Those two directories are derived and gitignored; third-party skills
// also land in .agents/skills/ via `skills experimental_install`, and this
// script leaves them alone.
//
// Run: node scripts/sync-skills.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const agentSkills = path.join(repoRoot, '.agents', 'skills');
const claudeSkills = path.join(repoRoot, '.claude', 'skills');

const SOURCES = [
  { dir: path.join(repoRoot, 'skills'), label: 'distributable' },
  { dir: path.join(repoRoot, 'dev-skills'), label: 'repo-local' },
];

/** Skill dirs are those containing a SKILL.md. */
function discover(sourceDir) {
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(sourceDir, e.name, 'SKILL.md')))
    .map((e) => e.name);
}

fs.mkdirSync(agentSkills, { recursive: true });
fs.mkdirSync(claudeSkills, { recursive: true });

let synced = 0;
const seen = new Map();

for (const { dir, label } of SOURCES) {
  for (const name of discover(dir)) {
    if (seen.has(name)) {
      console.error(
        `Error: skill "${name}" exists in both ${seen.get(name)} and ${label} sources. Names must be unique.`
      );
      process.exit(1);
    }
    seen.set(name, label);

    const from = path.join(dir, name);
    const to = path.join(agentSkills, name);

    // Replace rather than overlay, so deleted files don't linger.
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });

    // .claude/skills/<name> must be a symlink into .agents/skills/<name>.
    const link = path.join(claudeSkills, name);
    const wanted = path.join('..', '..', '.agents', 'skills', name);
    let ok = false;
    try {
      ok = fs.readlinkSync(link) === wanted;
    } catch {
      ok = false;
    }
    if (!ok) {
      fs.rmSync(link, { recursive: true, force: true });
      fs.symlinkSync(wanted, link);
    }

    console.log(`  ${label.padEnd(14)} ${name}`);
    synced += 1;
  }
}

if (synced === 0) {
  console.error('No skills found. Expected SKILL.md under skills/* or dev-skills/*.');
  process.exit(1);
}

console.log(`Synced ${synced} authored skill(s) into .agents/skills/ with .claude/skills/ symlinks.`);
