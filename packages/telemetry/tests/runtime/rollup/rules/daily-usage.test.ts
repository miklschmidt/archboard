// A day of records becomes one wide event: counts by command, agent and exit code, and whether
// two agents worked at the same time.

import { expect, test } from "bun:test";
import type { CommandRecord } from "#runtime/records/protocol/records.ts";
import { dailyUsage } from "#runtime/rollup/rules/daily-usage.ts";

/**
 * A command record of the day.
 * @param time The time of day, such as `10:00`.
 * @param agent The agent, or null for a person.
 * @param fields Other fields.
 * @returns The record.
 */
function command(time: string, agent: string | null, fields: Partial<CommandRecord> = {}) {
	return {
		kind: "command" as const,
		t: `2026-11-12T${time}:00.000Z`,
		command: "model read",
		exit: 0,
		ms: 100,
		agent,
		runner: null,
		version: "0.4.1",
		install: "release" as const,
		...fields,
	};
}

test("the day counts commands by name, agent and exit code", () => {
	const usage = dailyUsage([
		command("09:00", "claude"),
		command("09:05", "claude", { command: "model edit", exit: 2, ms: 300 }),
		command("09:10", "codex", { runner: "workbench" }),
		command("11:00", null),
		{ kind: "error", t: "2026-11-12T11:00:00.000Z", process: "cli" },
	]);
	expect(usage).toMatchObject({
		commands: 4,
		commands_by_name: { "model read": 3, "model edit": 1 },
		commands_by_agent: { claude: 2, codex: 1, none: 1 },
		commands_by_exit: { "0": 3, "2": 1 },
		workbench_commands: 1,
		agents: ["claude", "codex"],
		agents_overlapped: true,
		command_ms_p50: 100,
		command_ms_p95: 300,
		errors: 1,
		errors_by_process: { cli: 1 },
		versions: ["0.4.1"],
		install: "release",
	});
});

test("two agents at different hours did not work at the same time", () => {
	const usage = dailyUsage([command("09:00", "claude"), command("13:00", "codex")]);
	expect(usage["agents_overlapped"]).toBe(false);
});
