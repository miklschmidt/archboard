// What `archboard init` offers and runs (TASK-601): the package runners that install the skills
// through the skills CLI, the agents that can set up the language servers of a repository, and
// the prompt that such an agent gets. Choosing and installing a language server depends on the
// languages of the repository and on how it installs its tools, so an agent does it, with the
// user's consent.

/** The skills that an installation ships, each a directory of its skills directory. */
const BUNDLED_SKILLS = ["archboard", "archboard-pr", "archboard-plan"] as const;

/** The skills CLI (skills.sh), at the version that `init` was tested with. */
const SKILLS_CLI = "skills@1.7.6";

/** A program that runs an npm package without installing it. The order is the preference. */
const RUNNERS = [
	{ id: "bun", program: "bun", args: ["x"] },
	{ id: "pnpm", program: "pnpm", args: ["dlx"] },
	{ id: "npx", program: "npx", args: ["--yes"] },
] as const;

/** A package runner. */
type Runner = (typeof RUNNERS)[number];

/** An agent harness that takes a first prompt as its argument. */
const AGENTS = [
	{ id: "claude-code", label: "Claude Code", program: "claude" },
	{ id: "codex", label: "Codex", program: "codex" },
] as const;

/** An agent harness. */
type Agent = (typeof AGENTS)[number];

/** What the agent that sets up the language servers of a repository is told. */
const LANGUAGE_SERVER_PROMPT = [
	"Finish the Archboard setup of this repository: set up its language servers, so that `archboard check code` resolves names to their definitions.",
	"Archboard cannot do this by itself, because the right server and the way to install it depend on the repository.",
	"",
	"Use the archboard skill, and follow its setup reference (references/setup.md).",
	"1. Find the languages that the repository uses, and the servers that `.archboard/language-servers.json` names already.",
	"2. For each language without a server, choose one. Prefer the way that the repository installs its tools already, such as a Nix flake, devenv, devbox or its package manager, so that every machine and CI run gets the same server. Where the server must run through that tool, plan a wrapper script in the repository.",
	"3. Before you install anything or write any file, show the user the plan: each language, its server, how it gets installed, and each `archboard repo language-server` command. Wait until the user confirms or changes the plan.",
	"4. Carry out the plan. Then run `archboard check code`, and make sure that it reports no `language-server-missing` for those languages.",
	"5. Tell the user to commit `.archboard/language-servers.json` and any wrapper script.",
].join("\n");

/** What an agent that ran `init` itself reads last. */
const UNFINISHED_SETUP = `The setup of this repository is not finished. You must finish it yourself:\n\n${LANGUAGE_SERVER_PROMPT}`;

/**
 * The runners that a lookup finds, in the order of preference.
 * @param which Finds a program on the PATH, as `Bun.which` does.
 * @returns Each runner found, with the path of its program.
 */
function runnersOn(which: (program: string) => string | null): { runner: Runner; path: string }[] {
	return RUNNERS.flatMap((runner) => {
		const found = which(runner.program);
		return found === null ? [] : [{ runner, path: found }];
	});
}

/**
 * The agents that a lookup finds.
 * @param which Finds a program on the PATH, as `Bun.which` does.
 * @returns Each agent found, with the path of its program.
 */
function agentsOn(which: (program: string) => string | null): { agent: Agent; path: string }[] {
	return AGENTS.flatMap((agent) => {
		const found = which(agent.program);
		return found === null ? [] : [{ agent, path: found }];
	});
}

/**
 * The agents that get the skills: Codex always, because the skills CLI keeps every global skill in
 * its directory, ~/.agents/skills, and each other agent when its program is on the PATH.
 * @param which Finds a program on the PATH, as `Bun.which` does.
 * @returns The agents, as the skills CLI names them.
 */
function skillAgents(which: (program: string) => string | null): Agent["id"][] {
	return AGENTS.filter((agent) => agent.id === "codex" || which(agent.program) !== null).map(
		({ id }) => id,
	);
}

/**
 * The command that installs the bundled skills globally with the skills CLI. Without a person at a
 * terminal, the skills CLI must not ask.
 * @param runner The runner.
 * @param program The path of the runner's program.
 * @param source The skills directory of the installation.
 * @param agents The agents that get the skills.
 * @param interactive Whether a person answers the skills CLI's questions.
 * @returns The command.
 */
function skillsCommand(
	runner: Runner,
	program: string,
	source: string,
	agents: readonly Agent["id"][],
	interactive: boolean,
): string[] {
	return [
		program,
		...runner.args,
		SKILLS_CLI,
		"add",
		source,
		"-g",
		...(interactive ? [] : ["-y"]),
		"--agent",
		...agents,
		"--skill",
		...BUNDLED_SKILLS,
	];
}

export {
	type Agent,
	type Runner,
	AGENTS,
	BUNDLED_SKILLS,
	LANGUAGE_SERVER_PROMPT,
	RUNNERS,
	UNFINISHED_SETUP,
	agentsOn,
	runnersOn,
	skillAgents,
	skillsCommand,
};
