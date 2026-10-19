#!/usr/bin/env bun
// Regenerate the consumer skill's derived files in place: the JSON Schemas for
// the persisted board document, the vault configuration and the authoring
// payloads, and the installation-local copy of INSTALL.md, under
// skills/archboard/references/generated/ (ignored). `bun install` runs it, and
// every install of the skill runs the same preparation; run it again after
// changing a schema or INSTALL.md.
//
// Run: bun scripts/generate-skill-artifacts.ts [--output-dir <skill-copy>]

import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSkillArtifacts } from "@archboard/skills/distribution";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.indexOf("--output-dir");
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) {
	console.error("generate-skill-artifacts: --output-dir requires a skill directory.");
	process.exit(2);
}
const requested = outputFlag >= 0 ? process.argv[outputFlag + 1] : null;
const skill = requested
	? isAbsolute(requested)
		? requested
		: resolve(process.cwd(), requested)
	: join(root, "skills", "archboard");
const prepared = prepareSkillArtifacts(skill, { root });
for (const file of prepared.files) {
	console.log(`generated ${join(skill, file)}`);
}
