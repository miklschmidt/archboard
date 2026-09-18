// What moved between a row's two arms, and whether the move is worth a word.
// A pass/fail count is a tally of runs and any change to it is real; a grader
// mean over three runs moves by a third for one grader point, so a mean is
// held to the noise the batch measures in itself before it is called
// anything. That noise is read off the runs the two arms hold in common,
// paired scenario for scenario and repetition for repetition: whatever a
// scenario scores in both arms cancels inside its pair, and the spread of what
// is left, over the square root of how many pairs were averaged, is how far
// the mean of them can sit from the truth. Improvements and regressions are
// read the same way, and the row's one word is drawn only where more than one
// scenario's runs stand behind it.

import type { RunVerdict } from "@/runtime/skill-evaluation/lib/grader";
import type { Maybe } from "@/runtime/skill-evaluation/lib/report-numbers";
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
	/** How far the spread of this row's own paired differences says a mean can move meaning nothing. */
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

/** Which way of each count is the better outcome; the count names its own arm tally. */
const COUNT_IS_BETTER: Readonly<Record<QualityCount, "higher" | "lower">> = {
	succeeded: "higher",
	visualFailed: "lower",
};

/**
 * Floating-point slack, not a threshold: two means over the same denominator
 * must not beat their own bar by a rounding error, as 26/3 - 25/3 otherwise
 * can against 1/3.
 */
const NOISE_SLACK = 1e-9;

/** One pair of runs the two arms share, scored on one axis. */
interface ScorePair {
	readonly before: number;
	readonly after: number;
}

/**
 * One arm's scores on one axis, by the identity both arms share: a scenario
 * and a repetition. A comparable row holds the same identities in both arms,
 * so this is what pairs them.
 * @param runs The arm's runs.
 * @param axis The axis.
 * @returns The scores under each identity, in run order, absent where the run carries none.
 */
function scoresByIdentity(runs: readonly RunRecord[], axis: QualityAxis): Map<string, Maybe[]> {
	const scores = new Map<string, Maybe[]>();
	for (const run of runs) {
		const identity = JSON.stringify([run.scenario, run.repetition]);
		const carried = scores.get(identity) ?? [];
		carried.push(run.verdict === null ? null : scoreOf(run.verdict, axis));
		scores.set(identity, carried);
	}
	return scores;
}

/**
 * The two arms' scores on one axis, paired run for matched run. Pairing is
 * what makes an aggregate row honest: whatever a scenario scores in both arms
 * cancels inside its own pair, so what is left varies only between the arms,
 * and one scenario being harder than another is not mistaken for noise.
 * @param baselineRuns The baseline arm's runs.
 * @param candidateRuns The candidate arm's runs.
 * @param axis The axis.
 * @returns One entry per pair both arms scored.
 */
function pairedScores(
	baselineRuns: readonly RunRecord[],
	candidateRuns: readonly RunRecord[],
	axis: QualityAxis,
): ScorePair[] {
	const after = scoresByIdentity(candidateRuns, axis);
	return [...scoresByIdentity(baselineRuns, axis)].flatMap(([identity, before]) =>
		before.flatMap((score, index) => {
			const other = after.get(identity)?.[index] ?? null;
			return score === null || other === null ? [] : [{ before: score, after: other }];
		}),
	);
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
 * How far a mean of paired differences can sit from the truth on the noise the
 * batch measures in itself: the distance between the largest and smallest
 * difference, over the square root of how many were averaged. The spread is
 * what the same skill on the same work varies by; a mean of many such draws
 * approaches the truth as the square root of their number, not as their
 * number, so a bar that divided by the count would shrink faster than the
 * uncertainty it stands for and would call a whole batch regressed on a
 * fraction of a grader point.
 * @param differences One paired difference per run pair.
 * @returns The movement that means nothing; zero when nothing was paired.
 */
function pairedNoise(differences: readonly number[]): number {
	if (differences.length === 0) return 0;
	const spread = Math.max(...differences) - Math.min(...differences);
	return spread / Math.sqrt(differences.length);
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
		const before = baseline[measure];
		const after = candidate[measure];
		const delta = after - before;
		return {
			measure,
			before,
			after,
			delta,
			direction: directionOf(COUNT_IS_BETTER[measure] === "higher" ? delta : -delta, 0),
		};
	});
}

/**
 * How each grader mean moved, pair by pair, against the bar the spread of
 * those pairs sets. An axis no pair of runs both scored is left out rather
 * than reported as flat.
 * @param baselineRuns The baseline arm's runs.
 * @param candidateRuns The candidate arm's runs.
 * @returns One entry per axis both arms scored.
 */
function axisChanges(
	baselineRuns: readonly RunRecord[],
	candidateRuns: readonly RunRecord[],
): AxisChange[] {
	return AXES.flatMap((axis) => {
		const pairs = pairedScores(baselineRuns, candidateRuns, axis);
		if (pairs.length === 0) return [];
		const before = average(pairs.map((pair) => pair.before));
		const after = average(pairs.map((pair) => pair.after));
		const noise = pairedNoise(pairs.map((pair) => pair.after - pair.before));
		const delta = after - before;
		return [{ axis, before, after, delta, noise, direction: directionOf(delta, noise) }];
	});
}

/**
 * The mean of values there is at least one of.
 * @param values The values.
 * @returns The mean.
 */
function average(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
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
	pairedNoise,
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
