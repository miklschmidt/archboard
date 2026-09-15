// Comparison reports: per scenario, per primary workflow, and the broad case
// on its own. Author usage and grader usage are never added together; a
// metric a run could not supply is reported as unavailable, and a run that
// failed is a row, not a gap.

import type { CommandClass, ExposureKind, Usage } from "@/runtime/skill-evaluation/lib/events";
import type { Arm, RunStatus } from "@/runtime/skill-evaluation/lib/blind";
import type { CaptureSummary } from "@/runtime/skill-evaluation/lib/captures";
import type { RunVerdict, VisualStanding } from "@/runtime/skill-evaluation/lib/grader";
import type { GraderIdentity } from "@/runtime/skill-evaluation/lib/grader-runner";
import { agreementLines, type Agreement } from "@/runtime/skill-evaluation/lib/report-agreement";
import {
	mean,
	median,
	summedField,
	type Maybe,
} from "@/runtime/skill-evaluation/lib/report-numbers";
import {
	auditReasons,
	contaminated,
	contaminationLine,
	unaudited,
	unauditedLine,
	wroteDirectly,
} from "@/runtime/skill-evaluation/lib/report-audit";

/** One run as the report reads it. */
interface RunRecord {
	readonly run: string;
	readonly arm: Arm;
	readonly scenario: string;
	readonly workflow: string;
	readonly report: "primary" | "broad";
	readonly repetition: number;
	readonly status: RunStatus;
	readonly durationMs: number;
	readonly usage: Usage | null;
	readonly commandCounts: Readonly<Record<CommandClass, number>>;
	/** Direct board-file writes outside the CLI; null when the run did not record them. */
	readonly directWrites: number | null;
	/** Commands that reached for evaluation material, by kind; null when the run did not record exposure. */
	readonly exposure: Readonly<Record<ExposureKind, number>> | null;
	/** Which declared captures were taken and which were not; null when the run recorded none. */
	readonly captures: CaptureSummary | null;
	/**
	 * The visual verdict as it stands once the captures are counted: the
	 * grader's own answer, downgraded to incomplete when a capture failed or
	 * the grader did not open one; null when the run is not graded.
	 */
	readonly visual: VisualStanding | null;
	readonly outcomesPassed: boolean;
	readonly guardrailsPassed: boolean;
	readonly verdict: RunVerdict | null;
	readonly semanticallyCompliant: boolean | null;
	readonly waivedFeatures: readonly string[];
}

/** One job expected in the saved batch, before a run has produced a manifest. */
type PlannedRun = Pick<RunRecord, "arm" | "scenario" | "workflow" | "report" | "repetition">;

/** What one arm did on one scenario. */
interface ArmSummary {
	readonly runs: number;
	readonly planned: number;
	readonly completed: number;
	readonly graded: number;
	readonly succeeded: number;
	readonly guardrailViolations: number;
	readonly outcomeFailures: number;
	readonly semanticFailures: number;
	readonly waived: number;
	/** Runs whose author read evaluation material or another run's world. */
	readonly contaminated: number;
	/** Runs whose author wrote a board file outside the CLI. */
	readonly directWrites: number;
	/** Runs recorded before the harness kept file changes and exposure, which can say neither. */
	readonly unaudited: number;
	/** Graded runs whose every capture was taken, opened by the grader and found legible. */
	readonly visualPassed: number;
	/** Graded runs the grader looked at and found wanting. */
	readonly visualFailed: number;
	/** Graded runs with a capture missing, failed or not opened: no visual verdict stands. */
	readonly visualIncomplete: number;
	readonly medianTotalTokens: Maybe;
	readonly medianInputTokens: Maybe;
	readonly medianCachedTokens: Maybe;
	readonly medianOutputTokens: Maybe;
	readonly medianDiscoveryCommands: Maybe;
	readonly medianOperationCommands: Maybe;
	readonly medianInvestigationCommands: Maybe;
	readonly meanSemanticCorrectness: Maybe;
	readonly meanArchitecturalTruth: Maybe;
	readonly meanReadability: Maybe;
}

/** One row of the comparison: a scenario or a workflow. */
interface ComparisonRow {
	readonly key: string;
	readonly baseline: ArmSummary;
	readonly candidate: ArmSummary;
	/** Candidate median total tokens over baseline, as a signed percentage; null when either is unavailable. */
	readonly tokenChangePercent: Maybe;
	readonly qualityRegressed: boolean | null;
}

/** The whole report. */
interface Report {
	readonly scenarios: readonly ComparisonRow[];
	readonly workflows: readonly ComparisonRow[];
	readonly broad: readonly ComparisonRow[];
	readonly failures: readonly RunRecord[];
	/** Runs that read evaluation material, reached another run, or wrote directly to the vault: kept apart from every comparison. */
	readonly contamination: readonly RunRecord[];
	readonly graderUsage: Usage | null;
	/** Who graded and how its usage is counted; null when nothing was graded. */
	readonly grader: GraderIdentity | null;
	readonly authorUsage: { readonly baseline: Usage | null; readonly candidate: Usage | null };
}

/** One grader's report over the batch, with the records it was built from. */
interface GraderReport {
	readonly grader: GraderIdentity | null;
	readonly report: Report;
	readonly runs: readonly RunRecord[];
}

/** The whole batch: one report per grader that graded it, and how they agree. */
interface BatchReport {
	readonly graders: readonly GraderReport[];
	readonly agreement: Agreement | null;
}

/**
 * Whether a run counts as a success: it completed, every deterministic check
 * held, and both semantic compliance and the visual evaluation passed.
 * @param run The run.
 * @returns True on success.
 */
function succeeded(run: RunRecord): boolean {
	return (
		run.status === "completed" &&
		run.outcomesPassed &&
		run.guardrailsPassed &&
		run.verdict !== null &&
		run.semanticallyCompliant === true &&
		run.visual === "pass"
	);
}

/**
 * Sum a required producer usage field without inventing a fallback for missing runs.
 * @param usages The complete usages.
 * @param pick The required field.
 * @returns The sum.
 */
function sumRequiredField(usages: readonly Usage[], pick: (usage: Usage) => number): number {
	return usages.reduce((sum, usage) => sum + pick(usage), 0);
}

/**
 * Sums usage across runs, field by field, under the producer's semantics.
 * @param usages The usages.
 * @returns The sum, or null when none exist.
 */
function sumUsage(usages: readonly (Usage | null)[]): Usage | null {
	const known = usages.filter((usage): usage is Usage => usage !== null);
	if (known.length === 0 || known.length !== usages.length) return null;
	return {
		input: sumRequiredField(known, (usage) => usage.input),
		cached: sumRequiredField(known, (usage) => usage.cached),
		cacheWrite: summedField(known, (usage) => usage.cacheWrite),
		output: sumRequiredField(known, (usage) => usage.output),
		reasoning: summedField(known, (usage) => usage.reasoning),
		total: sumRequiredField(known, (usage) => usage.total),
	};
}

/**
 * The median of one usage field across runs.
 * @param runs The runs.
 * @param pick The field.
 * @returns The median, or null when no run has usage.
 */
function medianUsage(runs: readonly RunRecord[], pick: (usage: Usage) => number): Maybe {
	return median(runs.map((run) => (run.usage === null ? null : pick(run.usage))));
}

/**
 * The mean of one grader score across graded runs.
 * @param runs The runs.
 * @param pick The score.
 * @returns The mean, or null when no run was graded.
 */
function meanScore(runs: readonly RunRecord[], pick: (verdict: RunVerdict) => number): Maybe {
	return mean(runs.map((run) => (run.verdict === null ? null : pick(run.verdict))));
}

/**
 * Summarises one arm's runs.
 * @param runs The runs of one arm.
 * @param planned The number of jobs selected for this arm.
 * @returns The summary.
 */
function summarize(runs: readonly RunRecord[], planned = runs.length): ArmSummary {
	return {
		runs: runs.length,
		planned,
		completed: runs.filter((run) => run.status === "completed").length,
		graded: runs.filter((run) => run.verdict !== null).length,
		succeeded: runs.filter(succeeded).length,
		guardrailViolations: runs.filter((run) => !run.guardrailsPassed).length,
		outcomeFailures: runs.filter((run) => !run.outcomesPassed).length,
		semanticFailures: runs.filter((run) => run.semanticallyCompliant === false).length,
		waived: runs.filter((run) => run.waivedFeatures.length > 0).length,
		contaminated: runs.filter(contaminated).length,
		directWrites: runs.filter(wroteDirectly).length,
		unaudited: runs.filter(unaudited).length,
		visualPassed: runs.filter((run) => run.visual === "pass").length,
		visualFailed: runs.filter((run) => run.visual === "fail").length,
		visualIncomplete: runs.filter((run) => run.visual === "incomplete").length,
		medianTotalTokens: medianUsage(runs, (usage) => usage.total),
		medianInputTokens: medianUsage(runs, (usage) => usage.input),
		medianCachedTokens: medianUsage(runs, (usage) => usage.cached),
		medianOutputTokens: medianUsage(runs, (usage) => usage.output),
		medianDiscoveryCommands: median(runs.map((run) => run.commandCounts.discovery)),
		medianOperationCommands: median(runs.map((run) => run.commandCounts.operation)),
		medianInvestigationCommands: median(runs.map((run) => run.commandCounts["code-investigation"])),
		meanSemanticCorrectness: meanScore(runs, (verdict) => verdict.semanticCorrectness),
		meanArchitecturalTruth: meanScore(runs, (verdict) => verdict.architecturalTruth),
		meanReadability: meanScore(runs, (verdict) => verdict.readability),
	};
}

/**
 * The signed percentage change from one value to another.
 * @param from The baseline value.
 * @param to The candidate value.
 * @returns The percentage, or null when either is unavailable or the baseline is zero.
 */
function percentChange(from: Maybe, to: Maybe): Maybe {
	return from === null || to === null || from === 0 ? null : ((to - from) / from) * 100;
}

/**
 * Whether a candidate mean fell below the baseline's, where both exist.
 * @param baseline The baseline summary.
 * @param candidate The candidate summary.
 * @param pick The mean.
 * @returns True on a drop.
 */
function dropped(
	baseline: ArmSummary,
	candidate: ArmSummary,
	pick: (summary: ArmSummary) => Maybe,
): boolean {
	const before = pick(baseline);
	const after = pick(candidate);
	return before !== null && after !== null && after < before;
}

/**
 * Whether quality regressed from baseline to candidate on any measure.
 * @param baseline The baseline summary.
 * @param candidate The candidate summary.
 * @returns True on a regression.
 */
function qualityRegressed(baseline: ArmSummary, candidate: ArmSummary): boolean | null {
	const assessed = [baseline, candidate].every(
		(arm) =>
			arm.runs > 0 && arm.graded === arm.runs && arm.visualPassed + arm.visualFailed === arm.runs,
	);
	if (!assessed || baseline.runs !== candidate.runs) return null;
	const measures: ((summary: ArmSummary) => Maybe)[] = [
		(s) => s.meanSemanticCorrectness,
		(s) => s.meanArchitecturalTruth,
		(s) => s.meanReadability,
	];
	return (
		candidate.succeeded < baseline.succeeded ||
		candidate.visualFailed > baseline.visualFailed ||
		measures.some((pick) => dropped(baseline, candidate, pick))
	);
}

/**
 * One comparison row over the runs sharing a key.
 * @param key The scenario or workflow.
 * @param runs Its runs, both arms.
 * @param planned Every job selected for this comparison.
 * @returns The row.
 */
function compare(
	key: string,
	runs: readonly RunRecord[],
	planned: readonly PlannedRun[],
): ComparisonRow {
	const baseline = summarize(
		runs.filter((run) => run.arm === "baseline"),
		planned.filter((run) => run.arm === "baseline").length,
	);
	const candidate = summarize(
		runs.filter((run) => run.arm === "candidate"),
		planned.filter((run) => run.arm === "candidate").length,
	);
	const complete = completePair(runs, planned);
	const comparableAudit = runs.every(
		(run) => !contaminated(run) && !wroteDirectly(run) && !unaudited(run),
	);
	const comparable = complete && comparableAudit;
	const allSucceeded = [baseline, candidate].every((arm) => arm.succeeded === arm.runs);
	return {
		key,
		baseline,
		candidate,
		// A run whose author read the checklist it is measured against, or
		// another run's answer, measures nothing about the skill; a change
		// computed over it would be a change in what was read, not in the skill.
		tokenChangePercent:
			comparable && allSucceeded && runs.every((run) => run.usage !== null)
				? percentChange(baseline.medianTotalTokens, candidate.medianTotalTokens)
				: null,
		qualityRegressed: comparable ? qualityRegressed(baseline, candidate) : null,
	};
}

/**
 * The scenario/repetition identities present in one arm, retaining duplicates.
 * @param runs The observed or planned jobs.
 * @param arm The arm to inspect.
 * @returns The sorted identities, independent of execution order.
 */
function jobKeys(runs: readonly PlannedRun[], arm: Arm): string[] {
	return runs
		.filter((run) => run.arm === arm)
		.map((run) => JSON.stringify([run.scenario, run.repetition]))
		.toSorted();
}

/**
 * Whether both arms contain exactly the paired jobs the batch planned.
 * @param runs The available records.
 * @param planned Every expected job, including those with no run manifest yet.
 * @returns True only for complete, matching scenario/repetition sets.
 */
function completePair(runs: readonly RunRecord[], planned: readonly PlannedRun[]): boolean {
	const expected = jobKeys(planned, "baseline");
	if (expected.length === 0) return false;
	const key = JSON.stringify(expected);
	return [
		jobKeys(planned, "candidate"),
		jobKeys(runs, "baseline"),
		jobKeys(runs, "candidate"),
	].every((keys) => JSON.stringify(keys) === key);
}

/**
 * Groups runs by a key and compares each group.
 * @param runs The runs.
 * @param planned Every planned run, including jobs that have not produced a record.
 * @param keyOf The grouping.
 * @returns One row per key, in key order.
 */
function rows(
	runs: readonly RunRecord[],
	planned: readonly PlannedRun[],
	keyOf: (run: PlannedRun) => string,
): ComparisonRow[] {
	return [...new Set([...runs, ...planned].map(keyOf))].toSorted().map((key) =>
		compare(
			key,
			runs.filter((run) => keyOf(run) === key),
			planned.filter((run) => keyOf(run) === key),
		),
	);
}

/**
 * Builds the comparison report.
 * @param runs Every run of the batch, both arms, failures included.
 * @param graderUsage What the grading session cost, kept apart from the authors.
 * @param planned The batch's expected jobs, defaulting to the supplied run identities.
 * @param grader Who graded, when known.
 * @returns The report.
 */
function buildReport(
	runs: readonly RunRecord[],
	graderUsage: Usage | null,
	planned: readonly PlannedRun[] = runs,
	grader: GraderIdentity | null = null,
): Report {
	const primary = runs.filter((run) => run.report === "primary");
	const expectedPrimary = planned.filter((run) => run.report === "primary");
	return {
		scenarios: rows(primary, expectedPrimary, (run) => run.scenario),
		workflows: rows(primary, expectedPrimary, (run) => run.workflow),
		broad: rows(
			runs.filter((run) => run.report === "broad"),
			planned.filter((run) => run.report === "broad"),
			(run) => run.scenario,
		),
		failures: runs.filter((run) => !succeeded(run)),
		contamination: runs.filter((run) => contaminated(run) || wroteDirectly(run)),
		graderUsage,
		grader,
		authorUsage: {
			baseline: sumUsage(runs.filter((run) => run.arm === "baseline").map((run) => run.usage)),
			candidate: sumUsage(runs.filter((run) => run.arm === "candidate").map((run) => run.usage)),
		},
	};
}

/**
 * A number for a table cell, or a dash for one the runs could not supply.
 * @param value The value.
 * @param digits Decimal places.
 * @returns The cell text.
 */
function cell(value: Maybe, digits = 0): string {
	return value === null ? "n/a" : value.toFixed(digits);
}

/**
 * One arm's table line.
 * @param key The row's key.
 * @param arm The arm.
 * @param s The summary.
 * @returns The markdown line.
 */
function armLine(key: string, arm: Arm, s: ArmSummary): string {
	const audit =
		s.unaudited === s.runs && s.runs > 0 ? "unaudited" : `${s.contaminated}/${s.directWrites}`;
	const visual = `${s.visualPassed}/${s.visualFailed}/${s.visualIncomplete}`;
	return `| ${key} | ${arm} | ${s.runs}/${s.planned} | ${s.graded} | ${s.succeeded} | ${s.guardrailViolations} | ${s.outcomeFailures} | ${s.semanticFailures} | ${s.waived} | ${visual} | ${audit} | ${cell(s.medianTotalTokens)} | ${cell(s.medianCachedTokens)} | ${cell(s.medianOutputTokens)} | ${cell(s.medianDiscoveryCommands)} | ${cell(s.medianOperationCommands)} | ${cell(s.medianInvestigationCommands)} | ${cell(s.meanSemanticCorrectness, 1)} | ${cell(s.meanArchitecturalTruth, 1)} | ${cell(s.meanReadability, 1)} |`;
}

/**
 * The change line under a row's two arms.
 * @param row The row.
 * @returns The markdown line.
 */
function changeLine(row: ComparisonRow): string {
	const tokens = row.tokenChangePercent === null ? "n/a" : `${row.tokenChangePercent.toFixed(1)}%`;
	return `| ${row.key} | change | | | | | | | | | | ${tokens} | | | | | | ${row.qualityRegressed === null ? "unassessed" : row.qualityRegressed ? "REGRESSED" : "held"} | | |`;
}

/**
 * One markdown table over comparison rows.
 * @param title The table's heading.
 * @param table The rows.
 * @returns Markdown lines.
 */
function tableLines(title: string, table: readonly ComparisonRow[]): string[] {
	return [
		`## ${title}`,
		"",
		"| key | arm | runs/planned | graded | ok | guardrail viol. | outcome fail | semantic fail | waived | visual pass/fail/incomplete | contaminated/direct | median total | median cached | median output | discovery | ops | investigation | correctness | truth | readability |",
		"| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
		...table.flatMap((row) => [
			armLine(row.key, "baseline", row.baseline),
			armLine(row.key, "candidate", row.candidate),
			changeLine(row),
		]),
		"",
	];
}

/**
 * One usage line of the report.
 * @param label Whose usage.
 * @param usage The usage.
 * @returns The markdown line.
 */
function usageLine(label: string, usage: Usage | null): string {
	return usage === null
		? `- ${label}: unavailable`
		: `- ${label}: input ${usage.input} (of which cached ${usage.cached}), output ${usage.output}, total ${usage.total}`;
}

/**
 * One line about a run that did not succeed.
 * @param run The run.
 * @returns The markdown line.
 */
function failureLine(run: RunRecord): string {
	const reasons = [
		run.status,
		...(run.outcomesPassed ? [] : ["outcome checks failed"]),
		...(run.guardrailsPassed ? [] : ["guardrail violated"]),
		...(run.verdict === null ? ["awaiting grading"] : []),
		...(run.semanticallyCompliant === false ? ["semantic compliance failed"] : []),
		...visualReasons(run),
		...(run.waivedFeatures.length === 0 ? [] : [`waived: ${run.waivedFeatures.join(", ")}`]),
		...auditReasons(run),
	];
	return `- ${run.run} (${run.arm}, ${run.scenario} rep ${run.repetition}): ${reasons.join(", ")}`;
}

/**
 * Why a run's visual evaluation cannot qualify it as successful.
 * @param run The record.
 * @returns No reason for a pass, otherwise its visible status.
 */
function visualReasons(run: RunRecord): string[] {
	return run.visual === "pass" ? [] : [`visual evaluation ${run.visual ?? "not graded"}`];
}

/**
 * The usage line's label for a grader, naming how its session was counted.
 * @param grader Who graded.
 * @returns The label.
 */
function graderUsageLabel(grader: GraderIdentity | null): string {
	const counted =
		grader?.semantics === "per-call"
			? "the sum of its calls"
			: "the thread's last cumulative reading";
	const who =
		grader === null ? "" : ` ${grader.name}${grader.model === null ? "" : ` ${grader.model}`},`;
	return `grader (one session, kept apart):${who} ${counted}`;
}

/**
 * The heading of one grader's report.
 * @param grader Who graded.
 * @returns The heading text.
 */
function reportHeading(grader: GraderIdentity | null): string {
	if (grader === null) return "Skill evaluation comparison (not graded)";
	const model = grader.model === null ? "" : `, ${grader.model}`;
	return `Skill evaluation comparison (grader: ${grader.name}${model})`;
}

/**
 * The report as markdown.
 * @param report The report.
 * @returns The document.
 */
function renderReportMarkdown(report: Report): string {
	return [
		`# ${reportHeading(report.grader)}`,
		"",
		"Token medians and quality scores are descriptive per-arm measurements; cached input is a subset of input and is never added to it. Quality comparisons require complete, equally sized graded arms and a clean audit. Efficiency comparisons additionally require every run to succeed and complete usage. Contaminated, directly written or unaudited runs cannot establish either comparison. Percentage targets are set only after a baseline is measured. The contaminated/direct column counts runs whose author read evaluation material or another run, and runs whose author wrote a board file outside the CLI. The visual column counts graded runs whose bitmap captures the harness supplied and the grader inspected and passed, failed, or could not judge because a capture was missing, failed or not opened; a visual pass is never unqualified, and a still capture proves nothing about animation.",
		"",
		...tableLines("Per scenario (primary)", report.scenarios),
		...tableLines("Per primary workflow", report.workflows),
		...tableLines("Broad mapping (reported separately)", report.broad),
		"## Usage",
		"",
		usageLine("authors, baseline (sum)", report.authorUsage.baseline),
		usageLine("authors, candidate (sum)", report.authorUsage.candidate),
		usageLine(graderUsageLabel(report.grader), report.graderUsage),
		"",
		"## Contaminated runs (kept apart from every comparison)",
		"",
		...(report.contamination.length === 0
			? ["- none"]
			: report.contamination.map(contaminationLine)),
		...unauditedLine(report),
		"",
		"## Runs that did not succeed",
		"",
		...(report.failures.length === 0 ? ["- none"] : report.failures.map(failureLine)),
		"",
	].join("\n");
}

/**
 * The whole batch as markdown: each grader's report, then how they agree.
 * @param batch The batch report.
 * @returns The document.
 */
function renderBatchReportMarkdown(batch: BatchReport): string {
	return [
		...batch.graders.map((entry) => renderReportMarkdown(entry.report)),
		...(batch.graders.length > 1 ? [agreementLines(batch.agreement).join("\n")] : []),
	].join("\n");
}

export {
	buildReport,
	median,
	mean,
	percentChange,
	renderBatchReportMarkdown,
	renderReportMarkdown,
	succeeded,
	sumUsage,
	summarize,
	type ArmSummary,
	type BatchReport,
	type ComparisonRow,
	type GraderReport,
	type Report,
	type RunRecord,
	type PlannedRun,
};
