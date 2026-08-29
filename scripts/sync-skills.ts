#!/usr/bin/env bun
// Sync this repo's authored skills into the agent directories.
//
// One tracked source: skills/. Every subdirectory holding a SKILL.md is a
// skill; nothing is hardcoded, so adding a skill means adding a directory.
//
// Each one is copied to .agents/skills/<name>, which .claude/skills/<name>
// symlinks to. Both of those directories are derived and gitignored.
// Third-party skills also land in .agents/skills/, installed separately by
// `skills experimental_install` from skills-lock.json; this script leaves them
// alone and only replaces the skills it owns.
//
// Run: bun scripts/sync-skills.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(repoRoot, "skills");
const agentSkills = path.join(repoRoot, ".agents", "skills");
const claudeSkills = path.join(repoRoot, ".claude", "skills");

function discover(sourceDir: string): string[] {
	if (!fs.existsSync(sourceDir)) return [];
	return fs
		.readdirSync(sourceDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.filter((entry) => fs.existsSync(path.join(sourceDir, entry.name, "SKILL.md")))
		.map((entry) => entry.name);
}

fs.mkdirSync(agentSkills, { recursive: true });
fs.mkdirSync(claudeSkills, { recursive: true });

const names = discover(source);

const retiredNames = ["excalidraw-skill"];
for (const name of retiredNames) {
	if (names.includes(name)) continue;
	fs.rmSync(path.join(agentSkills, name), { recursive: true, force: true });
	fs.rmSync(path.join(claudeSkills, name), { recursive: true, force: true });
}

for (const name of names) {
	const from = path.join(source, name);
	const to = path.join(agentSkills, name);

	fs.rmSync(to, { recursive: true, force: true });
	fs.cpSync(from, to, { recursive: true });

	const link = path.join(claudeSkills, name);
	const wanted = path.join("..", "..", ".agents", "skills", name);
	let ok = false;
	try {
		ok = fs.readlinkSync(link) === wanted;
	} catch {}
	if (!ok) {
		fs.rmSync(link, { recursive: true, force: true });
		fs.symlinkSync(wanted, link);
	}

	console.log(`  ${name}`);
}

if (names.length === 0) {
	console.error("No skills found. Expected SKILL.md under skills/*.");
	process.exit(1);
}

console.log(
	`Synced ${names.length} authored skill(s) into .agents/skills/ with .claude/skills/ symlinks.`,
);
