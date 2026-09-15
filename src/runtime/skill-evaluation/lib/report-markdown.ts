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
	return `| ${key} | ${arm} | ${s.runs}/${s.planned} | ${s.graded} | ${s.succeeded} | ${s.guardrailViolations} | ${s.outcomeFailures} | ${s.semanticFailures} | ${s.waived} | ${visual} | ${audit} | ${cell(s.medianTotalTokens)} | ${cell(s.medianCachedTokens)} | ${cell(s.medianOutputTokens)} | ${cell(s.medianDiscoveryCommands)} | ${cell(s.medianOperationCommands)} | ${cell(s.medianInvestigationCommands)} | ${s.productSourceReads} | ${cell(s.meanSemanticCorrectness, 1)} | ${cell(s.meanArchitecturalTruth, 1)} | ${cell(s.meanReadability, 1)} | ${cell(s.meanBehaviouralCompleteness, 1)} | ${s.missedUnprompted} |`;
}

/**
 * The change line under a row's two arms.
 * @param row The row.
 * @returns The markdown line.
 */
function changeLine(row: ComparisonRow): string {
	const tokens = row.tokenChangePercent === null ? "n/a" : `${row.tokenChangePercent.toFixed(1)}%`;
	return `| ${row.key} | change | | | | | | | | | | ${tokens} | | | | | | | ${row.qualityRegressed === null ? "unassessed" : row.qualityRegressed ? "REGRESSED" : "held"} | | | | |`;
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
		"| key | arm | runs/planned | graded | ok | guardrail viol. | outcome fail | semantic fail | waived | visual pass/fail/incomplete | contaminated/direct | median total | median cached | median output | discovery | ops | investigation | product src | correctness | truth | readability | completeness | missed |",
		"| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
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
		"Token medians and quality scores are descriptive per-arm measurements; cached input is a subset of input and is never added to it. Quality comparisons require complete, equally sized graded arms and a clean audit. Efficiency comparisons additionally require every run to have done what was asked with its pictures inspected, and complete usage; a visual failure counts against its arm's quality but, since both arms share the renderer, does not withhold the cost comparison. Contaminated, directly written or unaudited runs cannot establish either comparison. Percentage targets are set only after a baseline is measured. The contaminated/direct column counts runs whose author read evaluation material or another run, and runs whose author wrote a board file outside the CLI. The visual column counts graded runs whose bitmap captures the harness supplied and the grader inspected and passed, failed, or could not judge because a capture was missing, failed or not opened; a visual pass is never unqualified, and a still capture proves nothing about animation. Completeness is the grader's 0-10 judgment of how far a board that wrote something uses the semantics the source justifies beyond what the request named, and missed counts the justified catalogue rows its authors left out, summed over the arm. Product src counts runs whose author read the archboard product's source past the installed skill, its generated schemas and --help; reading the skill is expected and reading Flask is investigation, but a read of the product is a question the skill or a CLI answer left open, listed by the grader under concerns as tooling:, and is neither contamination nor a failure.",
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

export { renderBatchReportMarkdown, renderReportMarkdown };
