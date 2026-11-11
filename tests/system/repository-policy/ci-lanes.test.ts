// CI runs the stages of `bun run check` as separate jobs, not as one command. A lane added to
// `check:all` and left out of the workflow would pass locally and never run on a pull request.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import viteConfig from "../../../vite.config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("every stage of check:all runs in a job of the CI workflow", () => {
	const checkAll = viteConfig.run?.tasks?.["check:all"];
	const command = typeof checkAll === "object" && "command" in checkAll ? checkAll.command : [];
	const stages = (Array.isArray(command) ? command : [command]).map((line) =>
		String(line).replace(/^vp run /u, ""),
	);
	expect(stages.length).toBeGreaterThan(0);
	const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
	const run = new Set([...workflow.matchAll(/\bvp run ([\w:-]+)/gu)].map((match) => match[1]));
	expect(stages.filter((stage) => !run.has(stage))).toEqual([]);
});
