// One installation's day as one wide event (ADR 0079): the counts of every record of that day.

import { TELEMETRY_MS } from "@archboard/timing";
import type { CommandRecord, DayRecord } from "#runtime/records/protocol/records.ts";

/** The properties of a `daily usage` event that its records give. */
type DailyUsage = Readonly<Record<string, unknown>>;

/**
 * Count each value of a key.
 * @param values The values.
 * @returns How often each value occurs.
 */
function tally(values: readonly string[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}

/**
 * A percentile of sorted durations, by the nearest rank.
 * @param sorted The durations in ascending order.
 * @param share The share below it, such as 0.95.
 * @returns The duration, or null without durations.
 */
function percentile(sorted: readonly number[], share: number): number | null {
	if (sorted.length === 0) return null;
	return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ?? null;
}

/**
 * Whether two different agents ran commands within the overlap window of each other.
 * @param commands The commands, in any order.
 * @returns True when two agents worked at the same time.
 */
function agentsOverlapped(commands: readonly CommandRecord[]): boolean {
	const lastSeen = new Map<string, number>();
	const timed = commands
		.filter((command) => command.agent !== null)
		.map((command) => ({ agent: command.agent ?? "", at: Date.parse(command.t) }))
		.toSorted((a, b) => a.at - b.at);
	for (const { agent, at } of timed) {
		for (const [other, seen] of lastSeen) {
			if (other !== agent && at - seen <= TELEMETRY_MS.agentOverlap) return true;
		}
		lastSeen.set(agent, at);
	}
	return false;
}

/**
 * Roll the records of one day into the properties of its `daily usage` event.
 * @param records The day's records.
 * @returns The counts and the facts of that day.
 */
function dailyUsage(records: readonly DayRecord[]): DailyUsage {
	const commands = records.filter((record) => record.kind === "command");
	const errors = records.filter((record) => record.kind === "error");
	const durations = commands.map((command) => command.ms).toSorted((a, b) => a - b);
	const versions = [...new Set(commands.map((command) => command.version))].toSorted();
	const agents = [...new Set(commands.flatMap((command) => command.agent ?? []))].toSorted();
	return {
		versions,
		version: commands.at(-1)?.version ?? null,
		install: commands.at(-1)?.install ?? null,
		commands: commands.length,
		commands_by_name: tally(commands.map((command) => command.command)),
		commands_by_agent: tally(commands.map((command) => command.agent ?? "none")),
		commands_by_exit: tally(commands.map((command) => String(command.exit))),
		workbench_commands: commands.filter((command) => command.runner === "workbench").length,
		agents,
		agents_overlapped: agentsOverlapped(commands),
		command_ms_p50: percentile(durations, 0.5),
		command_ms_p95: percentile(durations, 0.95),
		errors: errors.length,
		errors_by_process: tally(errors.map((error) => error.process)),
	};
}

export { dailyUsage, type DailyUsage };
