// What a grader filed beyond its verdicts, gathered for the report a person
// reads: the concerns it raised, grouped by what they are about, and the
// features it called untaught by the skill on some runs of a scenario and
// held against the run on others.

import type { Arm } from "@/runtime/skill-evaluation/lib/blind";
import type { RunRecord } from "@/runtime/skill-evaluation/lib/report";

/**
 * What a grader's concern is about, by the prefix the rubric's "Concerns"
 * and "What the run inherited" give it: the fixture the harness laid, a
 * question the skill or a CLI answer left open, or anything else.
 */
type ConcernKind = "fixture" | "tooling" | "other";

/** One expected feature filed as untaught by the skill on some runs and not on others. */
interface SkillDisagreement {
	readonly scenario: string;
	readonly feature: string;
	/** Runs whose finding put it on the skill. */
	readonly untaught: readonly string[];
	/** Runs whose finding held it against the run: a departure from the skill, or a contradicted board. */
	readonly otherwise: readonly string[];
}

/** One concern a grader raised, with the run it was raised on. */
interface RaisedConcern {
	readonly run: string;
	readonly arm: Arm;
	readonly scenario: string;
	readonly repetition: number;
	readonly text: string;
}

/**
 * Features filed as untaught by the skill on some runs of a scenario and
 * held against the run on others.
 * @param runs The runs, both arms.
 * @returns One entry per split feature, in scenario and feature order.
 */
function skillDisagreementsOf(runs: readonly RunRecord[]): SkillDisagreement[] {
	const answered = runs.flatMap((run) =>
		(run.verdict?.features ?? []).map((entry) => ({
			key: JSON.stringify([run.scenario, entry.feature]),
			scenario: run.scenario,
			feature: entry.feature,
			run: run.run,
			untaught: run.findings.skill.includes(entry.feature),
			// A pass makes no claim about whether the skill teaches it; only a
			// finding held against the run does.
			heldAgainst:
				run.findings.conformance.includes(entry.feature) ||
				run.findings.truth.includes(entry.feature),
		})),
	);
	return [...new Set(answered.map((entry) => entry.key))].toSorted().flatMap((key) => {
		const entries = answered.filter((entry) => entry.key === key);
		const untaught = entries.filter((entry) => entry.untaught).map((entry) => entry.run);
		const otherwise = entries.filter((entry) => entry.heldAgainst).map((entry) => entry.run);
		const [first] = entries;
		return untaught.length === 0 || otherwise.length === 0 || first === undefined
			? []
			: [{ scenario: first.scenario, feature: first.feature, untaught, otherwise }];
	});
}

/**
 * What a concern is about, by its prefix.
 * @param text The concern.
 * @returns Its kind.
 */
function concernKind(text: string): ConcernKind {
	const head = text.trimStart();
	if (head.startsWith("fixture:")) return "fixture";
	return head.startsWith("tooling:") ? "tooling" : "other";
}

/**
 * Every concern the graded runs carry, grouped by kind, in run order.
 * @param runs The runs.
 * @returns The concerns by kind.
 */
function concernsOf(runs: readonly RunRecord[]): Readonly<Record<ConcernKind, RaisedConcern[]>> {
	const raised = runs.flatMap((run) =>
		(run.verdict?.concerns ?? []).map((text) => ({
			run: run.run,
			arm: run.arm,
			scenario: run.scenario,
			repetition: run.repetition,
			text,
		})),
	);
	return {
		fixture: raised.filter((entry) => concernKind(entry.text) === "fixture"),
		tooling: raised.filter((entry) => concernKind(entry.text) === "tooling"),
		other: raised.filter((entry) => concernKind(entry.text) === "other"),
	};
}

export {
	concernsOf,
	skillDisagreementsOf,
	type ConcernKind,
	type RaisedConcern,
	type SkillDisagreement,
};
