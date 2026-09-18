// What moved between a row's two arms, and whether the move is worth a word.
// A pass/fail count is a tally of runs and any change to it is real; a grader
// mean over three runs moves by a third for one grader point, so a mean is
// held to the noise the batch measures in itself — the spread one arm showed
// on the same scenario and axis — before it is called anything. Improvements
// and regressions are read the same way, and the row's one word is drawn only
// where more than one scenario's runs stand behind it.

import type { RunVerdict } from "@/runtime/skill-evaluation/lib/grader";
import { mean, type Maybe } from "@/runtime/skill-evaluation/lib/report-numbers";
import type { ArmSummary, RunRecord } from "@/runtime/skill-evaluation/lib/report";

/** Which way one measure moved, once the noise the batch measures in itself is allowed for. */
type Direction = "improved" | "regressed" | "held";

/** A row's one word over every measure at once; "mixed" when some rose and some fell. */
type Standing = Direction | "mixed";

/** Why no change could be drawn for a row. */
type UnassessedReason = "arms-not-comparable" | "pictures-not-judged";

/** The 0-10 axes the grader scores. */
type QualityAxis = "correctness" | "truth" | "readability" | "completeness";

/** The pass/fail counts a row compares, which carry no noise bar. */
type QualityCount = "succeeded" | "visualFailed";

/** How one pass/fail count moved between the arms. */
interface CountChange {
	readonly measure: QualityCount;
	readonly before: number;
	readonly after: number;
	readonly delta: number;
	readonly direction: Direction;
}

/** How one grader mean moved between the arms, against what the batch calls noise. */
interface AxisChange {
	readonly axis: QualityAxis;
	readonly before: number;
	readonly after: number;
	readonly delta: number;
	/** How far this row's own within-arm spread says a mean can move meaning nothing. */
	readonly noise: number;
	readonly direction: Direction;
}

/** What moved between the arms of one row, or why nothing could be said. */
type QualityChange =
	| { readonly assessed: false; readonly reason: UnassessedReason }
	| {
			readonly assessed: true;
			/** The pass/fail counts, kept apart from the grader's means. */
			readonly counts: readonly CountChange[];
			/** Every axis both arms scored, moved or not. */
			readonly axes: readonly AxisChange[];
			/** The row's one word, drawn only where more than one scenario's runs stand behind it. */
			readonly standing: Standing | null;
	  };

/** The axes in the order the report prints them. */
const AXES: readonly QualityAxis[] = ["correctness", "truth", "readability", "completeness"];

/** The verdict score each axis reads. */
const AXIS_SCORES: Readonly<
	Record<
		QualityAxis,
		"semanticCorrectness" | "architecturalTruth" | "readability" | "behaviouralCompleteness"
	>
> = {
	correctness: "semanticCorrectness",
	truth: "architecturalTruth",
	readability: "readability",
	completeness: "behaviouralCompleteness",
};

/** The counts in the order the report prints them. */
const COUNTS: readonly QualityCount[] = ["succeeded", "visualFailed"];

/** The arm tally each count reads, and which way of it is the better outcome. */
const COUNT_TALLIES: Readonly<
	Record<QualityCount, { readonly field: QualityCount; readonly betterWhen: "higher" | "lower" }>
> = {
	succeeded: { field: "succeeded", betterWhen: "higher" },
	visualFailed: { field: "visualFailed", betterWhen: "lower" },
};

/**
 * Floating-point slack, not a threshold: two means over the same denominator
 * must not beat their own bar by a rounding error, as 26/3 - 25/3 otherwise
 * can against 1/3.
 */
const NOISE_SLACK = 1e-9;

/**
 * One axis's scores over the graded runs of one arm.
 * @param runs The arm's runs.
 * @param axis The axis.
 * @returns The scores the graded runs carry on it.
 */
function axisScores(runs: readonly RunRecord[], axis: QualityAxis): number[] {
	return runs
		.map((run): Maybe => (run.verdict === null ? null : scoreOf(run.verdict, axis)))
		.filter((score): score is number => score !== null);
}

/**
 * One verdict's score on one axis; a run that wrote nothing has no
 * completeness to score.
 * @param verdict The verdict.
 * @param axis The axis.
 * @returns The score, or null when the verdict does not carry it.
 */
function scoreOf(verdict: RunVerdict, axis: QualityAxis): Maybe {
	return verdict[AXIS_SCORES[axis]] ?? null;
}

/**
 * How far one arm's mean can move on the harness's own noise: the distance
 * between that arm's highest and lowest score on the axis, divided by the runs
 * it averages, because moving one run by the whole spread moves the mean by
 * exactly that. The same skill, the same scenario and the same axis, so
 * whatever it spans is what the batch measures in itself.
 * @param scores One arm's scores on one axis.
 * @returns The movement that means nothing; zero when the arm scored nothing.
 */
function armNoise(scores: readonly number[]): number {
	return scores.length === 0 ? 0 : (Math.max(...scores) - Math.min(...scores)) / scores.length;
}

/**
 * Which way a measure moved, counting only movement past the bar.
 * @param delta The signed movement, positive being the better outcome.
 * @param noise The movement the bar allows for.
 * @returns The direction.
 */
function directionOf(delta: number, noise: number): Direction {
	if (delta > noise + NOISE_SLACK) return "improved";
	if (delta < -(noise + NOISE_SLACK)) return "regressed";
	return "held";
}

/**
 * How each pass/fail count moved. A count is a tally of runs, not an average,
 * so it is held to no noise bar.
 * @param baseline The baseline summary.
 * @param candidate The candidate summary.
 * @returns One entry per count.
 */
function countChanges(baseline: ArmSummary, candidate: ArmSummary): CountChange[] {
	return COUNTS.map((measure) => {
		const tally = COUNT_TALLIES[measure];
		const before = baseline[tally.field];
		const after = candidate[tally.field];
		const delta = after - before;
		return {
			measure,
			before,
			after,
			delta,
			direction: directionOf(tally.betterWhen === "higher" ? delta : -delta, 0),
		};
	});
}

/**
 * How each grader mean moved, against the bar this row's own within-arm spread
 * sets. An axis neither arm scored is left out rather than reported as flat.
 * @param baselineRuns The baseline arm's runs.
 * @param candidateRuns The candidate arm's runs.
 * @returns One entry per axis both arms scored.
 */
function axisChanges(
	baselineRuns: readonly RunRecord[],
	candidateRuns: readonly RunRecord[],
): AxisChange[] {
	return AXES.flatMap((axis) => {
		const beforeScores = axisScores(baselineRuns, axis);
		const afterScores = axisScores(candidateRuns, axis);
		const before = mean(beforeScores);
		const after = mean(afterScores);
		if (before === null || after === null) return [];
		const noise = Math.max(armNoise(beforeScores), armNoise(afterScores));
		const delta = after - before;
		return [{ axis, before, after, delta, noise, direction: directionOf(delta, noise) }];
	});
}

/**
 * The one word over every measure of a row.
 * @param directions What each measure did.
 * @returns The standing.
 */
function standingOf(directions: readonly Direction[]): Standing {
	const regressed = directions.includes("regressed");
	const improved = directions.includes("improved");
	if (regressed && improved) return "mixed";
	if (regressed) return "regressed";
	return improved ? "improved" : "held";
}

/**
 * Whether more than one scenario's runs stand behind a row. A row covering one
 * scenario carries only its repetitions an arm, where one grader point on one
 * run moves a mean by a third; that is a delta to read, not a verdict to draw.
 * @param runs The row's runs.
 * @returns True when the row aggregates scenarios.
 */
function aggregatesScenarios(runs: readonly RunRecord[]): boolean {
	return new Set(runs.map((run) => run.scenario)).size > 1;
}

/**
 * Whether an arm's every run was graded and every picture judged either way.
 * @param arm The summary.
 * @returns True when a quality comparison has something complete to read.
 */
function judged(arm: ArmSummary): boolean {
	return (
		arm.runs > 0 && arm.graded === arm.runs && arm.visualPassed + arm.visualFailed === arm.runs
	);
}

/**
 * What moved between a row's arms, or which precondition withheld it.
 * @param runs The row's runs, both arms.
 * @param baseline The baseline summary.
 * @param candidate The candidate summary.
 * @param comparable Whether the arms are paired, audited and free of set-aside runs.
 * @returns The change.
 */
function changeOf(
	runs: readonly RunRecord[],
	baseline: ArmSummary,
	candidate: ArmSummary,
	comparable: boolean,
): QualityChange {
	if (!comparable || baseline.runs !== candidate.runs || baseline.runs === 0)
		return { assessed: false, reason: "arms-not-comparable" };
	if (![baseline, candidate].every(judged))
		return { assessed: false, reason: "pictures-not-judged" };
	const counts = countChanges(baseline, candidate);
	const axes = axisChanges(
		runs.filter((run) => run.arm === "baseline"),
		runs.filter((run) => run.arm === "candidate"),
	);
	return {
		assessed: true,
		counts,
		axes,
		standing: aggregatesScenarios(runs)
			? standingOf([...counts, ...axes].map((entry) => entry.direction))
			: null,
	};
}

export {
	armNoise,
	axisChanges,
	changeOf,
	countChanges,
	directionOf,
	standingOf,
	type AxisChange,
	type CountChange,
	type Direction,
	type QualityAxis,
	type QualityChange,
	type QualityCount,
	type Standing,
	type UnassessedReason,
};
