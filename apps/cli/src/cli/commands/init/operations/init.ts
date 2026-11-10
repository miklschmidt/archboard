// `archboard init` sets a repository up for Archboard (TASK-601): it installs the skills with the
// skills CLI, makes or finds the vault and registers the checkout, and hands the language servers
// of the repository to an agent.

import { z } from "zod";
import { defineCommand } from "#cli/contract/protocol/contract.ts";
import { installBundledSkills } from "#cli/commands/init/operations/skills-install.ts";
import { setUpRepository } from "#cli/commands/init/operations/repo-setup.ts";
import { handOffLanguageServers } from "#cli/commands/init/operations/language-server-handoff.ts";
import { AGENTS, RUNNERS } from "#cli/commands/init/rules/setup-choices.ts";

const InitInputSchema = z.object({
	repo: z.string().optional(),
	tail: z.array(z.string()).default([]),
});

const InitResultSchema = z.object({
	success: z.literal(true),
	skills: z.union([
		z.object({ runner: z.enum(RUNNERS.map(({ id }) => id)) }),
		z.object({ skipped: z.string(), command: z.string() }),
	]),
	setup: z.object({
		repo: z.string(),
		vault: z.string(),
		vaultCreated: z.boolean(),
		vaultIgnored: z.boolean(),
		removedBlocks: z.array(z.string()),
	}),
	agent: z.enum(AGENTS.map(({ id }) => id)).optional(),
	next: z.string().optional(),
});

const initContract = defineCommand({
	path: ["init"],
	shared: [],
	summary: "Set this repository up for Archboard and hand its language servers to an agent",
	description: [
		"Installs the `archboard`, `archboard-pr` and `archboard-plan` skills of this installation globally with the skills CLI (skills.sh). It installs them for Codex, and for Claude Code when `claude` is on the `PATH`.",
		"",
		"The skills CLI is started by `bun`, `pnpm` or `npx`:",
		"- At a terminal, `init` asks which of those on the `PATH` to use, or to skip.",
		"- Without a terminal, it uses the first one found, in that order.",
		"",
		"Then `init` makes the repository's vault, `<repo>/.archboard/vault`, when it has none. It registers the checkout so that a browser lists it.",
		"",
		"`init` removes a block that an earlier version wrote into `CLAUDE.md` or `AGENTS.md`. Nothing else in the file changes.",
		"",
		"Last, the language servers. Choosing and installing them depends on the repository, so an agent sets them up.",
		"",
		"What happens then depends on the terminal:",
		"- At a terminal, `init` asks whether Claude Code or Codex, whichever is on the `PATH`, does it. It starts that agent in the repository with a prompt. The agent shows its plan and waits for your consent before it changes anything.",
		"- Without a terminal, `init` assumes that an agent runs it. Its answer ends with that prompt in `next`. The setup is not finished until the agent sets up the language servers.",
	].join("\n"),
	examples: ["archboard init", "archboard init --repo ~/Projects/payments"],
	parameters: [
		{
			kind: "option",
			key: "repo",
			spellings: ["--repo"],
			value: "required",
			placeholder: "dir",
			description: "The repository to set up",
			default: "the git checkout that holds the working directory, else the working directory",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: InitInputSchema },
	result: InitResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description:
					"What each step did, ending with the prompt for an agent when no agent was started",
			},
		],
		/**
		 * Init has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Installs the skills, sets the repository up and hands its language servers to an agent.
	 * @param input - The parsed input.
	 * @param context - The command execution context.
	 * @returns What each step did.
	 */
	async handler(input, context) {
		const interactive = process.stdin.isTTY && process.stdout.isTTY;
		const skills = await installBundledSkills(interactive, context);
		const setup = await setUpRepository({
			...(input.repo === undefined ? {} : { repoSpec: input.repo }),
			context,
		});
		const handoff = await handOffLanguageServers(setup.repo, interactive);
		// The handoff comes last, so that an agent that ran init reads its prompt at the end.
		return { result: { success: true as const, skills, setup, ...handoff } };
	},
});

export { initContract };
