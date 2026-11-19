// The last step of `archboard init`: the language servers of the repository (TASK-601). They
// cannot be set up without judgment, so an agent sets them up. A person at a terminal picks
// Claude Code or Codex, whichever is on the PATH, and `init` starts it in the repository with the
// brief. Without a terminal, an agent runs `init`, and the answer ends with the brief for it.

import { choose } from "#cli/commands/init/operations/terminal-choice.ts";
import { agentsOn, type Agent } from "#cli/commands/init/rules/setup-choices.ts";

/** What the step did: the agent that it started, or the prompt that is left to give an agent. */
type Handoff = { readonly agent: Agent["id"] } | { readonly next: string };

/**
 * The agent that a person at a terminal picks.
 * @returns The agent and its program, or undefined when none is on the PATH or the person skips.
 */
async function pickAgent(): Promise<ReturnType<typeof agentsOn>[number] | undefined> {
	const found = agentsOn((program) => Bun.which(program));
	const [first, ...others] = found;
	if (first === undefined) return undefined;
	const picked = await choose("Set up the language servers of this repository with", [
		{
			value: first.agent.id,
			label: first.agent.label,
			hint: "it asks you before it changes anything",
		},
		...others.map(({ agent }) => ({ value: agent.id, label: agent.label })),
		{ value: "skip", label: "Skip", hint: "print the prompt for an agent" },
	]);
	return found.find(({ agent }) => agent.id === picked);
}

/**
 * Hand the language servers of a repository to an agent.
 * @param repo The repository root, where the agent starts.
 * @param brief What the agent is told.
 * @param interactive Whether a person is at a terminal.
 * @returns What the step did.
 */
async function handOffLanguageServers(
	repo: string,
	brief: string,
	interactive: boolean,
): Promise<Handoff> {
	// An agent that ran init itself reads this last.
	if (!interactive)
		return {
			next: `The setup of this repository is not finished. You must finish it yourself:\n\n${brief}`,
		};
	const chosen = await pickAgent();
	if (chosen === undefined) return { next: brief };
	const child = Bun.spawn([chosen.path, brief], {
		cwd: repo,
		stdio: ["inherit", "inherit", "inherit"],
	});
	await child.exited;
	return { agent: chosen.agent.id };
}

export { handOffLanguageServers };
