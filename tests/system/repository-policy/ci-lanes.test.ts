// CI runs the stages of `bun run check` as separate jobs, not as one command. A lane added to
// `check:all` and left out of the workflow would pass locally and never run on a pull request.
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "shell-quote";
import { z } from "zod";

import viteConfig from "../../../vite.config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const commandSchema = z.object({ run: z.string().optional() });
const workflowSchema = z.object({
	jobs: z.record(
		z.string(),
		z.object({
			steps: z
				.array(
					commandSchema.extend({
						env: z.record(z.string(), z.string()).optional(),
					}),
				)
				.optional(),
			strategy: z
				.object({
					matrix: z.object({
						include: z.array(commandSchema).optional(),
					}),
				})
				.optional(),
		}),
	),
});

test("every stage of check:all runs in a job of the CI workflow", () => {
	const checkAll = viteConfig.run?.tasks?.["check:all"];
	const command = typeof checkAll === "object" && "command" in checkAll ? checkAll.command : [];
	const stages = (Array.isArray(command) ? command : [command]).map((line) =>
		String(line).replace(/^vp run /u, ""),
	);
	expect(stages.length).toBeGreaterThan(0);
	const workflow = workflowSchema.parse(
		Bun.YAML.parse(fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8")),
	);
	const commands = Object.values(workflow.jobs).flatMap((job) =>
		(job.steps ?? []).flatMap((step) => {
			if (!step.run) return [];
			const words = parse(step.run, (name) => `$${name}`);
			const runsMatrix =
				words.some(
					(word, index) =>
						word === "bash" && words[index + 1] === "-c" && words[index + 2] === "$LANE",
				) && step.env?.["LANE"] === "${{ matrix.run }}";
			return [step.run].concat(
				runsMatrix ? (job.strategy?.matrix.include ?? []).flatMap((entry) => entry.run ?? []) : [],
			);
		}),
	);
	const run = new Set(
		commands.flatMap((script) =>
			script.split("\n").flatMap((line) => {
				const words = parse(line);
				return words.flatMap((word, index) =>
					word === "vp" && words[index + 1] === "run" && typeof words[index + 2] === "string"
						? [words[index + 2]]
						: [],
				);
			}),
		),
	);
	expect(stages.filter((stage) => !run.has(stage))).toEqual([]);
});
