// Which agent ran a command, in one stable short name for each agent.

import type { Caller } from "#runtime/records/protocol/records.ts";

/** The variable with which Archboard's workbench marks the commands of its own Codex. */
const RUNNER_VARIABLE = "ARCHBOARD_TELEMETRY_RUNNER";

/** Names that `AI_AGENT` can give for an agent that `std-env` also detects by another name. */
const ALIASES: Readonly<Record<string, string>> = {
	"claude-code": "claude",
	"codex-cli": "codex",
	"cursor-agent": "cursor",
	"gemini-cli": "gemini",
	"copilot-cli": "copilot",
};

/** The leading name of a raw agent value, before a version or a suffix such as `_agent`. */
const LEADING_NAME = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*/u;

/**
 * The leading name of a raw agent value.
 * @param raw The raw value, such as `claude-code_2-1-322_agent`.
 * @returns The leading name in lower case, such as `claude-code`, or an empty string.
 */
function leadingName(raw: string): string {
	return LEADING_NAME.exec(raw.toLowerCase())?.[0] ?? "";
}

/**
 * Turn a detected agent name into one stable short name. `AI_AGENT` can carry a version, such as
 * `claude-code_2-1-322_agent`, and a name that `std-env` gives differently, such as `claude`.
 * @param detected The name that `std-env`'s `detectAgent()` gave, or undefined.
 * @returns The short name, `other` for a name that is no plain word, or null without an agent.
 */
function agentName(detected: string | undefined): string | null {
	if (!detected) return null;
	const leading = leadingName(detected);
	if (leading === "" || leading.length > 32) return "other";
	return ALIASES[leading] ?? leading;
}

/**
 * Who ran this process.
 * @param detected The name that `std-env`'s `detectAgent()` gave, or undefined.
 * @param env The process environment.
 * @returns The agent and the runner.
 */
function callerOf(
	detected: string | undefined,
	env: Readonly<Record<string, string | undefined>>,
): Caller {
	return {
		agent: agentName(detected),
		runner: env[RUNNER_VARIABLE] === "workbench" ? "workbench" : null,
	};
}

export { agentName, callerOf, RUNNER_VARIABLE };
