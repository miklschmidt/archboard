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
	ConcernKind,
	Report,
	RunRecord,
	SkillDisagreement,
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
	"findings conf./unseen/truth/skill",
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
		"findings conf./unseen/truth/skill": `${s.findings.conformance}/${s.conformanceUnseen}/${s.findings.truth}/${s.findings.skill}`,
	});
}

/**
 * One axis's cell on the change line: what it moved by, the bar this row's own
 * within-arm spread set, and whether the move cleared it, in either direction.
 * @param axes Every axis the row compared.
 * @param name The axis this column holds.
 * @returns The cell text, or "n/a" for an axis no pair of runs both scored.
 */
function axisCell(axes: readonly AxisChange[], name: AxisChange["axis"]): string {
	const axis = axes.find((entry) => entry.axis === name);
	if (axis === undefined) return "n/a";
	return `${signed(axis.delta, 2)}/${axis.noise.toFixed(2)}${axis.direction === "held" ? "" : "!"}`;
}

/**
 * One count's cell on the change line. Every assessed row compares every
 * count, so there is always one to show.
 * @param counts The count changes.
 * @param measure Which count.
 * @returns The signed movement.
 */
function countCell(counts: readonly CountChange[], measure: CountChange["measure"]): string {
	const count = counts.find((entry) => entry.measure === measure);
	return count === undefined ? "n/a" : signed(count.delta);
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
		...gradingReasons(run),
		...(run.waivedFeatures.length === 0 ? [] : [`waived: ${run.waivedFeatures.join(", ")}`]),
		...auditReasons(run),
	];
	return `- ${run.run} (${run.arm}, ${run.scenario} rep ${run.repetition}): ${reasons.join(", ")}`;
}

/**
 * What the grading says of a run that did not succeed. A run set aside says
 * so instead of failing its checklist, and still says what became of its
 * pictures, which is its own and not the grader's.
 * @param run The run.
 * @returns Zero or more reasons.
 */
function gradingReasons(run: RunRecord): string[] {
	return [
		...(run.verdict === null ? ["awaiting grading"] : []),
		...(run.semanticallyCompliant === false
			? [`semantic compliance failed${onWhoseAccount(run)}`]
			: []),
		...(run.checklist?.standing === "off-checklist"
			? ["set aside: the grader answered off the checklist"]
			: []),
		...visualReasons(run),
	];
}

/**
 * Which authority a failed checklist answers to, so a run that departed from
 * the skill never reads like one whose board the source contradicts.
 * @param run The run.
 * @returns A parenthesis naming the features on each axis, or nothing when no finding was filed.
 */
function onWhoseAccount(run: RunRecord): string {
	const { findings, conformanceUnseen: unseen } = run;
	const seen = findings.conformance.filter((feature) => !unseen.includes(feature));
	const parts = [
		...(seen.length === 0 ? [] : [`departed from the skill: ${seen.join(", ")}`]),
		...(unseen.length === 0
			? []
			: [`departed from a passage its own skill never carried: ${unseen.join(", ")}`]),
		...(findings.truth.length === 0
			? []
			: [`followed the skill, contradicted by the source: ${findings.truth.join(", ")}`]),
	];
	return parts.length === 0 ? "" : ` (${parts.join("; ")})`;
}

/**
 * One line per expectation the skill never taught, with where the grader looked.
 * @param run The run.
 * @returns Markdown lines.
 */
function skillFindingLines(run: RunRecord): string[] {
	return (run.verdict?.features ?? []).flatMap((entry) =>
		entry.finding?.axis === "skill" && run.findings.skill.includes(entry.feature)
			? [
					`- ${run.run} (${run.arm}, ${run.scenario} rep ${run.repetition}): ${entry.feature}, at ${entry.finding.passage}: ${entry.finding.gap}`,
				]
			: [],
	);
}

/**
 * One line about a feature the grader called untaught on some runs and not on others.
 * @param split The disagreement.
 * @returns The markdown line.
 */
function disagreementLine(split: SkillDisagreement): string {
	return `- ${split.scenario} ${split.feature}: untaught on ${split.untaught.join(", ")}; judged on the run on ${split.otherwise.join(", ")}`;
}

/** Each kind of concern's heading, in the order the report prints them. */
const CONCERN_HEADINGS: readonly (readonly [ConcernKind, string])[] = [
	["fixture", "### About the fixture (fixture:)"],
	["tooling", "### A question the skill or a CLI answer left open (tooling:)"],
	["other", "### Anything else"],
];

/**
 * The grader's concerns, grouped by what they are about.
 * @param report The report.
 * @returns Markdown lines.
 */
function concernLines(report: Report): string[] {
	return [
		"## Concerns the grader raised",
		"",
		...CONCERN_HEADINGS.flatMap(([kind, heading]) => {
			const raised = report.concerns[kind];
			return [
				heading,
				"",
				...(raised.length === 0
					? ["- none"]
					: raised.map(
							(entry) =>
								`- ${entry.run} (${entry.arm}, ${entry.scenario} rep ${entry.repetition}): ${entry.text}`,
						)),
				"",
			];
		}),
	];
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
 * A list's lines, or a single "none" when it is empty.
 * @param items The entries.
 * @param lines Each entry's line or lines.
 * @returns Markdown lines.
 */
function listed<T>(items: readonly T[], lines: (item: T) => string | string[]): string[] {
	return items.length === 0 ? ["- none"] : items.flatMap(lines);
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
		"Each row's change line reports what moved rather than a single word. The ok and visual cells carry signed changes in the pass/fail counts, which are tallies of runs and are held to no bar. Each quality cell carries the candidate's mean minus the baseline's, then the noise bar this row's own runs set for that axis. The two arms are paired run for run by scenario and repetition, so whatever a scenario scores in both arms cancels inside its own pair and one scenario being harder than another is never mistaken for noise; the bar is the distance between the largest and smallest of those paired differences, over the square root of how many were averaged, because the mean of many draws approaches the truth as the square root of their number. A move that clears its bar is marked with an exclamation mark, in either direction; an improvement is reported exactly as a regression is. The last column draws the row's one word only where more than one scenario's runs stand behind it, so a per-scenario row over three runs an arm says deltas only; where a row cannot be compared at all it says which precondition failed. Runs the grader answered off the checklist — it skipped declared features and graded names of its own — are set aside like contaminated runs: they enter neither comparison, they withhold their row's comparison, and they are listed below instead of being counted as semantic failures. Being set aside hides nothing else about them: such a run still appears among the runs that did not succeed, with whatever else went wrong with it.",
		"",
		"Token medians and quality scores are descriptive per-arm measurements; cached input is a subset of input and is never added to it. Quality comparisons require complete, equally sized graded arms and a clean audit. Efficiency comparisons additionally require every run to have done what was asked with its pictures inspected, and complete usage; a visual failure counts against its arm's quality but, since both arms share the renderer, does not withhold the cost comparison. Contaminated, directly written or unaudited runs cannot establish either comparison. Percentage targets are set only after a baseline is measured. The contaminated/direct column counts runs whose author read evaluation material or another run, and runs whose author wrote a board file outside the CLI. The visual column counts graded runs whose bitmap captures the harness supplied and the grader inspected and passed, failed, or could not judge because a capture was missing, failed or not opened; a visual pass is never unqualified, and a still capture proves nothing about animation. Completeness is the grader's 0-10 score for how far what a run added — the whole board it created, or on a board it changed the subjects it created or gave a new value in a field it authored, as the rubric's \"What the skill adds unprompted\" scopes it — uses the semantics the source justifies beyond what the request named, and a run that added nothing is not scored; missed counts the catalogue rows the source justified for what the runs added and they left out, summed over the arm. Findings count the expected features graded missing or incorrect, by the authority each answers to as the rubric's Findings section defines it: conf. departed from what the skill teaches; unseen departed from a passage the run's own skill never carried, since conformance is judged against the candidate skill for both arms and a baseline run can be held to text it was never shown; truth followed the skill and says something the source contradicts; skill expected what no passage of the skill teaches, which is a finding about the skill or the scenario and fails no run. A waiver is counted under waived, and a verdict filed before findings existed counts under none. Whether the skill teaches an expectation is a fact about the scenario, so a feature the grader called untaught on some runs and not on others is listed with the findings about the skill. Product src counts runs whose author read the archboard product's source past the installed skill, its generated schemas and --help; reading the skill is expected and reading Flask is investigation, but a read of the product is a question the skill or a CLI answer left open, listed by the grader under concerns as tooling:, and is neither contamination nor a failure. Guidance counts runs that read every skill file their scenario names over runs that recorded their reads; a run that skipped one is listed below, since a cost saving over a recipe nobody read measures the wrong thing.",
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
		...listed(report.contamination, contaminationLine),
		...unauditedLine(report),
		"",
		"## Runs set aside as ungradable (the grader answered off the checklist)",
		"",
		...listed(report.ungradable, ungradableLine),
		"",
		"## Runs that skipped the guidance their scenario names",
		"",
		...listed(report.skippedGuidance, guidanceLine),
		"",
		"## Findings about the skill (an expectation no passage teaches; no run failed for it)",
		"",
		...listed(report.skillFindings, skillFindingLines),
		"",
		"### Features the grader called untaught on some runs of a scenario and not on others",
		"",
		...listed(report.skillDisagreements, disagreementLine),
		"",
		...concernLines(report),
		"## Runs that did not succeed",
		"",
		...listed(report.failures, failureLine),
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
