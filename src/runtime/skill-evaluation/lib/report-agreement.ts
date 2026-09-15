// How two graders of one batch agree: for every run both graded, their
// verdicts side by side, the share of runs where semantic compliance and the
// visual standing agree, and the mean absolute difference of each score.

import type { Arm } from "@/runtime/skill-evaluation/lib/blind";
import type { VisualStanding } from "@/runtime/skill-evaluation/lib/grader";
import type { RunRecord } from "@/runtime/skill-evaluation/lib/report";
import { mean, type Maybe } from "@/runtime/skill-evaluation/lib/report-numbers";
import type { GraderName } from "@/runtime/skill-evaluation/lib/suite";

/** One grader's reading of one run, as far as agreement is measured. */
interface GradedView {
	readonly semanticallyCompliant: boolean | null;
	readonly visual: VisualStanding | null;
	readonly semanticCorrectness: number;
	readonly architecturalTruth: number;
	readonly readability: number;
}

/** One run both graders graded. */
interface RunAgreement {
	readonly run: string;
	readonly arm: Arm;
	readonly scenario: string;
	readonly repetition: number;
	readonly verdicts: Readonly<Record<GraderName, GradedView>>;
	readonly semanticAgree: boolean;
	readonly visualAgree: boolean;
}

/** The three scores, each a mean absolute difference between the graders. */
interface ScoreDifferences {
	readonly semanticCorrectness: Maybe;
	readonly architecturalTruth: Maybe;
	readonly readability: Maybe;
}

/** Agreement between two graders over one batch. */
interface Agreement {
	readonly graders: readonly [GraderName, GraderName];
	readonly runs: readonly RunAgreement[];
	/** The share of runs both graded whose semantic pass/fail agrees; null when none. */
	readonly semanticAgreement: Maybe;
	/** The share of runs both graded whose visual standing agrees; null when none. */
	readonly visualAgreement: Maybe;
	readonly meanAbsoluteDifference: ScoreDifferences;
}

/**
 * One grader's view of a graded run.
 * @param record The record, with a verdict.
 * @returns The view, or null when the run is not graded.
 */
function viewOf(record: RunRecord): GradedView | null {
	if (record.verdict === null) return null;
	return {
		semanticallyCompliant: record.semanticallyCompliant,
		visual: record.visual,
		semanticCorrectness: record.verdict.semanticCorrectness,
		architecturalTruth: record.verdict.architecturalTruth,
		readability: record.verdict.readability,
	};
}

/**
 * The share of runs a predicate holds for.
 * @param runs The runs.
 * @param holds The predicate.
 * @returns The share, or null when there are no runs.
 */
function share(runs: readonly RunAgreement[], holds: (run: RunAgreement) => boolean): Maybe {
	return runs.length === 0 ? null : runs.filter(holds).length / runs.length;
}

/**
 * The mean absolute difference of one score across the runs.
 * @param runs The runs.
 * @param graders The two graders.
 * @param pick The score.
 * @returns The mean, or null when there are no runs.
 */
function scoreDifference(
	runs: readonly RunAgreement[],
	graders: readonly [GraderName, GraderName],
	pick: (view: GradedView) => number,
): Maybe {
	return mean(
		runs.map((run) => Math.abs(pick(run.verdicts[graders[0]]) - pick(run.verdicts[graders[1]]))),
	);
}

/**
 * Agreement between two graders' records of the same batch.
 * @param first One grader and its records.
 * @param first.grader The grader.
 * @param first.runs Its records.
 * @param second The other.
 * @param second.grader The grader.
 * @param second.runs Its records.
 * @returns The agreement, or null when no run was graded by both.
 */
function agreementOf(
	first: { readonly grader: GraderName; readonly runs: readonly RunRecord[] },
	second: { readonly grader: GraderName; readonly runs: readonly RunRecord[] },
): Agreement | null {
	const graders: [GraderName, GraderName] = [first.grader, second.grader];
	const others = new Map(second.runs.map((record) => [record.run, record]));
	const runs = first.runs.flatMap((record): RunAgreement[] => {
		const other = others.get(record.run);
		const a = viewOf(record);
		const b = other === undefined ? null : viewOf(other);
		if (a === null || b === null) return [];
		return [
			{
				run: record.run,
				arm: record.arm,
				scenario: record.scenario,
				repetition: record.repetition,
				verdicts: {
					codex: first.grader === "codex" ? a : b,
					claude: first.grader === "claude" ? a : b,
				},
				semanticAgree: a.semanticallyCompliant === b.semanticallyCompliant,
				visualAgree: a.visual === b.visual,
			},
		];
	});
	if (runs.length === 0) return null;
	return {
		graders,
		runs,
		semanticAgreement: share(runs, (run) => run.semanticAgree),
		visualAgreement: share(runs, (run) => run.visualAgree),
		meanAbsoluteDifference: {
			semanticCorrectness: scoreDifference(runs, graders, (view) => view.semanticCorrectness),
			architecturalTruth: scoreDifference(runs, graders, (view) => view.architecturalTruth),
			readability: scoreDifference(runs, graders, (view) => view.readability),
		},
	};
}

/**
 * A share as a percentage cell.
 * @param value The share.
 * @returns The cell text.
 */
function percent(value: Maybe): string {
	return value === null ? "n/a" : `${(value * 100).toFixed(0)}%`;
}

/**
 * A difference as a cell.
 * @param value The difference.
 * @returns The cell text.
 */
function difference(value: Maybe): string {
	return value === null ? "n/a" : value.toFixed(2);
}

/**
 * One grader's cell of a run's agreement line.
 * @param view The view.
 * @returns The cell text.
 */
function viewCell(view: GradedView): string {
	const semantic =
		view.semanticallyCompliant === null ? "?" : view.semanticallyCompliant ? "pass" : "fail";
	return `${semantic} / ${view.visual ?? "n/a"} / ${view.semanticCorrectness}-${view.architecturalTruth}-${view.readability}`;
}

/**
 * The agreement section as markdown.
 * @param agreement The agreement, or null when no run was graded by both.
 * @returns Markdown lines.
 */
function agreementLines(agreement: Agreement | null): string[] {
	if (agreement === null)
		return ["## Grader agreement", "", "- no run was graded by two graders", ""];
	const [a, b] = agreement.graders;
	const d = agreement.meanAbsoluteDifference;
	return [
		`## Grader agreement (${a} vs ${b})`,
		"",
		`Over ${agreement.runs.length} runs both graded: semantic pass/fail agrees on ${percent(agreement.semanticAgreement)}, visual standing agrees on ${percent(agreement.visualAgreement)}; mean absolute score difference correctness ${difference(d.semanticCorrectness)}, truth ${difference(d.architecturalTruth)}, readability ${difference(d.readability)}. Each cell reads semantic / visual / correctness-truth-readability.`,
		"",
		`| run | arm | scenario | rep | ${a} | ${b} | agree |`,
		"| --- | --- | --- | ---: | --- | --- | --- |",
		...agreement.runs.map(
			(run) =>
				`| ${run.run} | ${run.arm} | ${run.scenario} | ${run.repetition} | ${viewCell(run.verdicts[a])} | ${viewCell(run.verdicts[b])} | ${run.semanticAgree && run.visualAgree ? "yes" : run.semanticAgree ? "semantic only" : run.visualAgree ? "visual only" : "no"} |`,
		),
		"",
	];
}

export { agreementLines, agreementOf, type Agreement, type RunAgreement };
