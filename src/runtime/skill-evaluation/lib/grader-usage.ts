// What a grading session cost, under the runner's own semantics. Codex's
// `turn.completed` carries the thread's cumulative total, so a resumed call
// reports everything so far and a session costs its last reading. Claude's
// result line carries the call's own usage, so a session costs the sum.

import type { Usage } from "@/runtime/skill-evaluation/lib/events";
import type { UsageSemantics } from "@/runtime/skill-evaluation/lib/grader-runner";
import { sumUsage } from "@/runtime/skill-evaluation/lib/report";

/** A call as far as usage is concerned. */
interface UsageReading {
	readonly usage: Usage | null;
}

/**
 * The difference between two cumulative readings, field by field.
 * @param now The later reading.
 * @param before The earlier one.
 * @returns What happened in between.
 */
function usageSince(now: Usage, before: Usage): Usage {
	/**
	 * One optional field's difference, unavailable when either side is.
	 * @param pick The field.
	 * @returns The difference or null.
	 */
	const optional = (pick: (usage: Usage) => number | null): number | null => {
		const later = pick(now);
		const earlier = pick(before);
		return later === null || earlier === null ? null : later - earlier;
	};
	return {
		input: now.input - before.input,
		cached: now.cached - before.cached,
		cacheWrite: optional((usage) => usage.cacheWrite),
		output: now.output - before.output,
		reasoning: optional((usage) => usage.reasoning),
		total: now.total - before.total,
	};
}

/**
 * The last cumulative reading a session's earlier calls gave.
 * @param calls The calls so far.
 * @returns The reading, or null when none gave one.
 */
function lastReading(calls: readonly UsageReading[]): Usage | null {
	return calls.map((call) => call.usage).findLast((usage) => usage !== null) ?? null;
}

/**
 * One call's own usage. Under cumulative semantics a resumed call reports
 * everything the thread has cost so far, itself included, so its share is the
 * growth since the previous reading; a reading smaller than the previous one
 * is a thread started afresh, and then the reading is the call's own. Under
 * per-call semantics the reading is the call's own as reported.
 * @param earlier The session's earlier calls.
 * @param reported What this call reported.
 * @param semantics The runner's semantics.
 * @returns This call's usage, or null when it reported none.
 */
function callUsageFrom(
	earlier: readonly UsageReading[],
	reported: Usage | null,
	semantics: UsageSemantics = "cumulative",
): Usage | null {
	if (reported === null || semantics === "per-call") return reported;
	const previous = lastReading(earlier);
	return previous === null || reported.total < previous.total
		? reported
		: usageSince(reported, previous);
}

/**
 * What one grading session cost in total. Under cumulative semantics that is
 * the last reading of each run of cumulative readings, added up: one thread
 * resumed throughout is one reading, its last, and summing the calls would
 * count the first call's tokens once per call. Under per-call semantics it
 * is the sum of the calls that reported.
 * @param calls The session's calls, in order.
 * @param semantics The runner's semantics.
 * @returns The session's usage, or null when no call reported any.
 */
function sessionUsage(
	calls: readonly UsageReading[],
	semantics: UsageSemantics = "cumulative",
): Usage | null {
	const readings = calls.map((call) => call.usage).filter((usage) => usage !== null);
	if (readings.length === 0) return null;
	if (semantics === "per-call") return sumUsage(readings);
	// A reading ends a run of cumulative readings when the next one is smaller.
	const ends = readings.filter((reading, index) => {
		const next = readings[index + 1];
		return next === undefined || next.total < reading.total;
	});
	return sumUsage(ends);
}

export { callUsageFrom, sessionUsage };
