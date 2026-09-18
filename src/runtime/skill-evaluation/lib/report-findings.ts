// What a grader filed beyond its verdicts, gathered for the report a person
// reads: the concerns it raised, grouped by what they are about, and the
// features it called untaught by the skill on some runs of a scenario and
// held against the run on others, and the findings it put on the skill while
// naming a passage the feature cites.

import type { Arm } from "@/runtime/skill-evaluation/lib/blind";
import type { ExcusedDeparture } from "@/runtime/skill-evaluation/lib/grader";
import type { RunRecord } from "@/runtime/skill-evaluation/lib/report";

/**
 * What a grader's concern is about, by the prefix the rubric's "Concerns"
 * and "What the run inherited" give it: the fixture the harness laid, a
 * question the skill or a CLI answer left open, or anything else.
 */
type ConcernKind = "fixture" | "tooling" | "other";

/** One expected feature counted as untaught by the skill on some runs and against the run on others. */
interface SkillDisagreement {
	readonly scenario: string;
	readonly feature: string;
	/** Runs whose finding is counted on the skill. */
	readonly untaught: readonly string[];
	/**
	 * Runs whose finding is counted against the run: a departure from the
	 * skill, or a contradicted board. A skill finding on a passage the feature
	 * cites is counted here, whatever axis the grader gave it.
	 */
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

/** A skill finding on a passage its feature cites, with the run it was filed on. */
interface ExcusedDepartureOnRun extends ExcusedDeparture {
	readonly run: string;
	readonly arm: Arm;
	readonly scenario: string;
	readonly repetition: number;
}

/**
 * Every skill finding the runs carry on a passage its feature cites, in run
 * order. A run whose grader answered off the checklist is set aside and fails
 * nothing, so its findings are not listed as failing it.
 * @param runs The runs.
 * @returns One entry per such finding.
 */
function excusedDeparturesOf(runs: readonly RunRecord[]): ExcusedDepartureOnRun[] {
	return runs.flatMap((run) =>
		(run.checklist?.standing === "off-checklist" ? [] : run.excusedDepartures).map((entry) => ({
			run: run.run,
			arm: run.arm,
			scenario: run.scenario,
			repetition: run.repetition,
			...entry,
		})),
	);
}

/**
 * Features counted as untaught by the skill on some runs of a scenario and
 * against the run on others, by the axis each finding is counted on rather
 * than the one the grader named.
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
	excusedDeparturesOf,
	skillDisagreementsOf,
	type ConcernKind,
	type ExcusedDepartureOnRun,
	type RaisedConcern,
	type SkillDisagreement,
};
