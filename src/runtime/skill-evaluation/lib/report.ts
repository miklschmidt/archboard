// Comparison reports: per scenario, per primary workflow, and the broad case
// on its own. Author usage and grader usage are never added together; a
// metric a run could not supply is reported as unavailable, and a run that
// failed is a row, not a gap.

import type {
	CommandClass,
	ExposureKind,
	GuidanceStanding,
	Usage,
} from "@/runtime/skill-evaluation/lib/events";
import type { Arm, RunStatus } from "@/runtime/skill-evaluation/lib/blind";
import type { CaptureSummary } from "@/runtime/skill-evaluation/lib/captures";
import {
	byAxis,
	type ChecklistStanding,
	type FindingAxis,
	type RunVerdict,
	type VisualStanding,
} from "@/runtime/skill-evaluation/lib/grader";
import type { GraderIdentity } from "@/runtime/skill-evaluation/lib/grader-runner";
import type { Agreement } from "@/runtime/skill-evaluation/lib/report-agreement";
import {
	mean,
	median,
	summedField,
	type Maybe,
} from "@/runtime/skill-evaluation/lib/report-numbers";
import {
	contaminated,
	unaudited,
	wroteDirectly,
} from "@/runtime/skill-evaluation/lib/report-audit";
import { changeOf, type QualityChange } from "@/runtime/skill-evaluation/lib/report-change";

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
	/** The guidance the scenario names and what of it the author read; null when the run did not record it. */
	readonly guidance: GuidanceStanding | null;
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
	/**
	 * Whether every expected feature passed; null when the run is not graded,
	 * and null when the grader answered off its checklist, which says nothing
	 * about the author either way.
	 */
	readonly semanticallyCompliant: boolean | null;
	readonly waivedFeatures: readonly string[];
	/** What the grader's answer did with the scenario's checklist; null when the run is not graded. */
	readonly checklist: ChecklistAnswer | null;
}

/** How far a grader's answer kept to the scenario's checklist. */
interface ChecklistAnswer {
	/** Whether the answer was about this scenario at all, as the grader decides it. */
	readonly standing: ChecklistStanding;
	/** Expected features the grader's answer never mentioned. */
	readonly unmentioned: readonly string[];
	/** Names the grader answered that the scenario's checklist does not hold. */
	readonly invented: readonly string[];
}

/**
 * What a grader's concern is about, by the prefix the rubric's "Concerns"
 * and "What the run inherited" give it: the fixture the harness laid, a
 * question the skill or a CLI answer left open, or anything else.
 */
type ConcernKind = "fixture" | "tooling" | "other";

/** One concern a grader raised, with the run it was raised on. */
interface RaisedConcern {
	readonly run: string;
	readonly arm: Arm;
	readonly scenario: string;
	readonly repetition: number;
	readonly text: string;
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
	/** Runs whose grader answered names the scenario never asked for: set aside, not failed. */
	readonly ungradable: number;
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
	/**
	 * Runs whose author read the archboard product's source, past the installed
	 * skill, the generated schemas and `--help`: each is a question the skill or
	 * a CLI answer left open, not a fault of the run.
	 */
	readonly productSourceReads: number;
	readonly meanSemanticCorrectness: Maybe;
	readonly meanArchitecturalTruth: Maybe;
	readonly meanReadability: Maybe;
	/** Over graded runs that added something and were scored for it; null when none was. */
	readonly meanBehaviouralCompleteness: Maybe;
	/** Runs that recorded their guidance reads and read every file their scenario names. */
	readonly guidanceRead: number;
	/** Runs that recorded their guidance reads at all. */
	readonly guidanceRecorded: number;
	/** Catalogue rows the source justified that the authors left out, summed over the arm. */
	readonly missedUnprompted: number;
	/**
	 * Feature findings summed over the arm, by the authority each answers to.
	 * A conformance finding is a departure from the skill, a truth finding a
	 * board that did what the skill teaches and still contradicts the source,
	 * and a skill finding an expectation the skill never taught — the last
	 * fails no run. A non-pass filed before findings existed counts under none.
	 */
	readonly findings: Readonly<Record<FindingAxis, number>>;
}

/** One row of the comparison: a scenario or a workflow. */
interface ComparisonRow {
	readonly key: string;
	readonly baseline: ArmSummary;
	readonly candidate: ArmSummary;
	/** Candidate median total tokens over baseline, as a signed percentage; null when either is unavailable. */
	readonly tokenChangePercent: Maybe;
	readonly change: QualityChange;
}

/** The whole report. */
interface Report {
	readonly scenarios: readonly ComparisonRow[];
	readonly workflows: readonly ComparisonRow[];
	/** Every primary run of each arm as one row, where the run counts support a verdict. */
	readonly totals: readonly ComparisonRow[];
	readonly broad: readonly ComparisonRow[];
	readonly failures: readonly RunRecord[];
	/** Runs whose grader answered off the scenario's checklist: kept apart from every comparison, and never a semantic failure. */
	readonly ungradable: readonly RunRecord[];
	/** Runs that read evaluation material, reached another run, or wrote directly to the vault: kept apart from every comparison. */
	readonly contamination: readonly RunRecord[];
	/** Runs whose author did not read every guidance file the scenario names. */
	readonly skippedGuidance: readonly RunRecord[];
	/** Runs the grader found an expectation the skill never taught in: findings about the skill, not failures. */
	readonly skillFindings: readonly RunRecord[];
	/** Every concern the grader raised, by what it is about, so none is left only in the verdict files. */
	readonly concerns: Readonly<Record<ConcernKind, readonly RaisedConcern[]>>;
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
	return didWhatWasAsked(run) && run.visual === "pass";
}

/**
 * Whether a run did what was asked, before its pictures are judged: it
 * completed, every deterministic check held, and the grader found it
 * semantically compliant.
 * @param run The run.
 * @returns True when only the visual verdict remains.
 */
function didWhatWasAsked(run: RunRecord): boolean {
	return (
		run.status === "completed" &&
		run.outcomesPassed &&
		run.guardrailsPassed &&
		run.verdict !== null &&
		run.semanticallyCompliant === true
	);
}

/**
 * Whether the grader answered something other than the scenario's checklist.
 * Such a verdict measures the grader, not the author, so the run is set aside
 * the way a contaminated one is: it enters no comparison, and its board is
 * neither compliant nor not. What counts as answering off is
 * `checklistStanding`'s to decide, not this.
 * @param run The run.
 * @returns True when the answer is not about this scenario.
 */
function answeredOffChecklist(run: RunRecord): boolean {
	return run.checklist?.standing === "off-checklist";
}

/**
 * The expected features a run's verdict carries a finding for, by axis.
 * @param run The run.
 * @returns The features on each axis; none for an ungraded run.
 */
function findingsOf(run: RunRecord): Readonly<Record<FindingAxis, string[]>> {
	const features = run.verdict?.features ?? [];
	return byAxis((axis) =>
		features.filter((entry) => entry.finding?.axis === axis).map((entry) => entry.feature),
	);
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
		ungradable: runs.filter(answeredOffChecklist).length,
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
		productSourceReads: runs.filter((run) => run.commandCounts["product-source"] > 0).length,
		guidanceRead: runs.filter((run) => run.guidance?.missing.length === 0).length,
		guidanceRecorded: runs.filter((run) => run.guidance !== null).length,
		meanSemanticCorrectness: meanScore(runs, (verdict) => verdict.semanticCorrectness),
		meanArchitecturalTruth: meanScore(runs, (verdict) => verdict.architecturalTruth),
		meanReadability: meanScore(runs, (verdict) => verdict.readability),
		meanBehaviouralCompleteness: mean(
			runs.map((run) => run.verdict?.behaviouralCompleteness ?? null),
		),
		missedUnprompted: runs.reduce(
			(count, run) =>
				count +
				(run.verdict?.unprompted ?? []).filter((entry) => entry.verdict === "missed").length,
			0,
		),
		findings: byAxis((axis) =>
			runs.reduce((count, run) => count + findingsOf(run)[axis].length, 0),
		),
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
 * Whether a run's cost can be compared: it did what was asked and the grader
 * looked at every picture. A failed picture does not withhold the comparison,
 * because the renderer that drew it is the same in both arms; what it drew
 * counts against the arm as a visual failure and a quality regression, not as
 * a run that did not happen. An unopened or untaken picture still withholds
 * it, since the run's visual quality is then unknown.
 * @param run The run.
 * @returns True when its usage can enter an efficiency comparison.
 */
function measured(run: RunRecord): boolean {
	return didWhatWasAsked(run) && (run.visual === "pass" || run.visual === "fail");
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
		(run) =>
			!contaminated(run) && !wroteDirectly(run) && !unaudited(run) && !answeredOffChecklist(run),
	);
	const comparable = complete && comparableAudit;
	const allMeasured = runs.every(measured);
	return {
		key,
		baseline,
		candidate,
		// A run whose author read the checklist it is measured against, or
		// another run's answer, measures nothing about the skill; a change
		// computed over it would be a change in what was read, not in the skill.
		tokenChangePercent:
			comparable && allMeasured && runs.every((run) => run.usage !== null)
				? percentChange(baseline.medianTotalTokens, candidate.medianTotalTokens)
				: null,
		change: changeOf(runs, baseline, candidate, comparable),
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
		totals: rows(primary, expectedPrimary, () => "all primary"),
		broad: rows(
			runs.filter((run) => run.report === "broad"),
			planned.filter((run) => run.report === "broad"),
			(run) => run.scenario,
		),
		// A run set aside is still listed among the runs that did not succeed:
		// what its grader did with the checklist says nothing about the picture
		// it never opened or the check it failed, and those are the run's own.
		failures: runs.filter((run) => !succeeded(run)),
		ungradable: runs.filter(answeredOffChecklist),
		contamination: runs.filter((run) => contaminated(run) || wroteDirectly(run)),
		skippedGuidance: runs.filter((run) => (run.guidance?.missing.length ?? 0) > 0),
		skillFindings: runs.filter((run) => findingsOf(run).skill.length > 0),
		concerns: concernsOf(runs),
		graderUsage,
		grader,
		authorUsage: {
			baseline: sumUsage(runs.filter((run) => run.arm === "baseline").map((run) => run.usage)),
			candidate: sumUsage(runs.filter((run) => run.arm === "candidate").map((run) => run.usage)),
		},
	};
}

export {
	answeredOffChecklist,
	buildReport,
	findingsOf,
	median,
	mean,
	percentChange,
	succeeded,
	sumUsage,
	summarize,
	type ArmSummary,
	type BatchReport,
	type ChecklistAnswer,
	type ComparisonRow,
	type ConcernKind,
	type GraderReport,
	type RaisedConcern,
	type Report,
	type RunRecord,
	type PlannedRun,
};
