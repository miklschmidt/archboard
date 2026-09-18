// The comparison report as markdown: the three tables, usage, the runs kept
// apart and the runs that did not succeed, then each grader's report side by
// side when more than one graded the batch.

import type { Usage } from "@/runtime/skill-evaluation/lib/events";
import type { Arm } from "@/runtime/skill-evaluation/lib/blind";
import type { GraderIdentity } from "@/runtime/skill-evaluation/lib/grader-runner";
import { agreementLines } from "@/runtime/skill-evaluation/lib/report-agreement";
import type { Maybe } from "@/runtime/skill-evaluation/lib/report-numbers";
import {
	auditReasons,
	contaminationLine,
	unauditedLine,
} from "@/runtime/skill-evaluation/lib/report-audit";
import type {
	ArmSummary,
	BatchReport,
	ComparisonRow,
	Report,
	RunRecord,
} from "@/runtime/skill-evaluation/lib/report";
import type {
	AxisChange,
	CountChange,
	UnassessedReason,
} from "@/runtime/skill-evaluation/lib/report-change";

/** The table's columns, in order. An arm line fills them all; a change line fills a few. */
const COLUMNS = [
	"key",
	"arm",
	"runs/planned",
	"graded",
	"ok",
	"guardrail viol.",
	"outcome fail",
	"semantic fail",
	"waived",
	"visual pass/fail/incomplete",
	"set aside cont./direct/ungrad.",
	"median total",
	"median cached",
	"median output",
	"discovery",
	"ops",
	"investigation",
	"product src",
	"guidance",
	"correctness",
	"truth",
	"readability",
	"completeness",
	"missed",
	"what moved",
] as const;

/** Why a row could not be assessed, in the reader's words. */
const UNASSESSED: Readonly<Record<UnassessedReason, string>> = {
	"arms-not-comparable": "unassessed: the arms are not comparable",
	"pictures-not-judged": "unassessed: a picture was never judged",
};

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
 * A signed movement, so a reader never has to work out which way it went.
 * @param value The movement.
 * @param digits Decimal places.
 * @returns The cell text.
 */
function signed(value: number, digits = 0): string {
	return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/**
 * One table line from the columns it fills.
 * @param cells The text of each column it fills, by column name.
 * @returns The markdown line.
 */
function line(cells: Readonly<Partial<Record<(typeof COLUMNS)[number], string>>>): string {
	return `| ${COLUMNS.map((column) => cells[column] ?? "").join(" | ")} |`;
}

/**
 * One arm's table line.
 * @param key The row's key.
 * @param arm The arm.
 * @param s The summary.
 * @returns The markdown line.
 */
function armLine(key: string, arm: Arm, s: ArmSummary): string {
	return line({
		key,
		arm,
		"runs/planned": `${s.runs}/${s.planned}`,
		graded: String(s.graded),
		ok: String(s.succeeded),
		"guardrail viol.": String(s.guardrailViolations),
		"outcome fail": String(s.outcomeFailures),
		"semantic fail": String(s.semanticFailures),
		waived: String(s.waived),
		"visual pass/fail/incomplete": `${s.visualPassed}/${s.visualFailed}/${s.visualIncomplete}`,
		"set aside cont./direct/ungrad.":
			s.unaudited === s.runs && s.runs > 0
				? "unaudited"
				: `${s.contaminated}/${s.directWrites}/${s.ungradable}`,
		"median total": cell(s.medianTotalTokens),
		"median cached": cell(s.medianCachedTokens),
		"median output": cell(s.medianOutputTokens),
		discovery: cell(s.medianDiscoveryCommands),
		ops: cell(s.medianOperationCommands),
		investigation: cell(s.medianInvestigationCommands),
		"product src": String(s.productSourceReads),
		guidance: s.guidanceRecorded === 0 ? "n/a" : `${s.guidanceRead}/${s.guidanceRecorded}`,
		correctness: cell(s.meanSemanticCorrectness, 1),
		truth: cell(s.meanArchitecturalTruth, 1),
		readability: cell(s.meanReadability, 1),
		completeness: cell(s.meanBehaviouralCompleteness, 1),
		missed: String(s.missedUnprompted),
	});
}

/**
 * One axis's cell on the change line: what it moved by, the bar this row's own
 * within-arm spread set, and whether the move cleared it, in either direction.
 * @param axes Every axis the row compared.
 * @param name The axis this column holds.
 * @returns The cell text, or a dash for an axis neither arm scored.
 */
function axisCell(axes: readonly AxisChange[], name: AxisChange["axis"]): string {
	const axis = axes.find((entry) => entry.axis === name);
	if (axis === undefined) return "n/a";
	return `${signed(axis.delta, 2)}/${axis.noise.toFixed(2)}${axis.direction === "held" ? "" : "!"}`;
}

/**
 * The cells a count fills on the change line.
 * @param counts The count changes.
 * @param measure Which count.
 * @returns The signed movement, or nothing when the count is absent.
 */
function countCell(counts: readonly CountChange[], measure: CountChange["measure"]): string {
	const count = counts.find((entry) => entry.measure === measure);
	return count === undefined ? "" : signed(count.delta);
}

/**
 * The change line under a row's two arms: what moved, by how much, and the
 * row's one word where the run counts support one.
 * @param row The row.
 * @returns The markdown line.
 */
function changeLine(row: ComparisonRow): string {
	const tokens = row.tokenChangePercent === null ? "n/a" : `${signed(row.tokenChangePercent, 1)}%`;
	const change = row.change;
	if (!change.assessed)
		return line({
			key: row.key,
			arm: "change",
			"median total": tokens,
			"what moved": UNASSESSED[change.reason],
		});
	return line({
		key: row.key,
		arm: "change",
		ok: countCell(change.counts, "succeeded"),
		"visual pass/fail/incomplete": `fail ${countCell(change.counts, "visualFailed")}`,
		"median total": tokens,
		correctness: axisCell(change.axes, "correctness"),
		truth: axisCell(change.axes, "truth"),
		readability: axisCell(change.axes, "readability"),
		completeness: axisCell(change.axes, "completeness"),
		"what moved": change.standing ?? "deltas only (one scenario)",
	});
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
		`| ${COLUMNS.join(" | ")} |`,
		`| ${COLUMNS.map((_, index) => (index < 2 || index === COLUMNS.length - 1 ? "---" : "---:")).join(" | ")} |`,
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
 * One line about a run whose grader answered off the scenario's checklist.
 * @param run The run.
 * @returns The markdown line.
 */
function ungradableLine(run: RunRecord): string {
	const unmentioned = (run.checklist?.unmentioned ?? []).join(", ");
	const invented = (run.checklist?.invented ?? []).join(", ");
	return `- ${run.run} (${run.arm}, ${run.scenario} rep ${run.repetition}): the grader never mentioned ${unmentioned}, and answered ${invented} instead`;
}

/**
 * One line about a run that did not read every guidance file its scenario names.
 * @param run The run.
 * @returns The markdown line.
 */
function guidanceLine(run: RunRecord): string {
	return `- ${run.run} (${run.arm}, ${run.scenario} rep ${run.repetition}): did not read ${(run.guidance?.missing ?? []).join(", ")}`;
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
		"Each row's change line reports what moved rather than a single word. The ok and visual cells carry signed changes in the pass/fail counts, which are tallies of runs and are held to no bar. Each quality cell carries the candidate's mean minus the baseline's, then the noise bar this row's own runs set for that axis: the distance between the highest and lowest score one arm gave, divided by the runs it averaged, since moving one run by the whole spread moves a mean by exactly that, taken over whichever arm spread further. A move that clears its bar is marked with an exclamation mark, in either direction; an improvement is reported exactly as a regression is. The last column draws the row's one word only where more than one scenario's runs stand behind it, so a per-scenario row over three runs an arm says deltas only; where a row cannot be compared at all it says which precondition failed. Runs the grader answered off the checklist — it skipped declared features and graded names of its own — are set aside like contaminated runs: they enter neither comparison, they are listed below rather than counted as semantic failures, and they withhold their row's comparison.",
		"",
		"Token medians and quality scores are descriptive per-arm measurements; cached input is a subset of input and is never added to it. Quality comparisons require complete, equally sized graded arms and a clean audit. Efficiency comparisons additionally require every run to have done what was asked with its pictures inspected, and complete usage; a visual failure counts against its arm's quality but, since both arms share the renderer, does not withhold the cost comparison. Contaminated, directly written or unaudited runs cannot establish either comparison. Percentage targets are set only after a baseline is measured. The contaminated/direct column counts runs whose author read evaluation material or another run, and runs whose author wrote a board file outside the CLI. The visual column counts graded runs whose bitmap captures the harness supplied and the grader inspected and passed, failed, or could not judge because a capture was missing, failed or not opened; a visual pass is never unqualified, and a still capture proves nothing about animation. Completeness is the grader's 0-10 judgment of how far a board that wrote something uses the semantics the source justifies beyond what the request named, and missed counts the justified catalogue rows its authors left out, summed over the arm. Product src counts runs whose author read the archboard product's source past the installed skill, its generated schemas and --help; reading the skill is expected and reading Flask is investigation, but a read of the product is a question the skill or a CLI answer left open, listed by the grader under concerns as tooling:, and is neither contamination nor a failure. Guidance counts runs that read every skill file their scenario names over runs that recorded their reads; a run that skipped one is listed below, since a cost saving over a recipe nobody read measures the wrong thing.",
		"",
		...tableLines("Per scenario (primary)", report.scenarios),
		...tableLines("Per primary workflow", report.workflows),
		...tableLines("Arm totals (primary)", report.totals),
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
		"## Runs set aside as ungradable (the grader answered off the checklist)",
		"",
		...(report.ungradable.length === 0 ? ["- none"] : report.ungradable.map(ungradableLine)),
		"",
		"## Runs that skipped the guidance their scenario names",
		"",
		...(report.skippedGuidance.length === 0
			? ["- none"]
			: report.skippedGuidance.map(guidanceLine)),
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

export { renderBatchReportMarkdown, renderReportMarkdown };
