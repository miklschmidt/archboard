// The job summary of a check, in Markdown: the counts, a bounded table of findings and evidence
// with fenced excerpts, the counts omitted from each list, then what the check did not read. Pure.
/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */

import { excerptText, evidenceDetails } from "./evidence.ts";
import type { Locations } from "./evidence.ts";
import { countFindings, findingDocsUrl } from "./findings.ts";
import type { CheckReading, Finding } from "./findings.ts";
import type { Outcome } from "./outcome.ts";

const TABLE_ROWS = 100;
const DETAILED_FINDINGS = 30;
const SKIPPED_NAMES = 5;

/**
 * Make text safe for one cell of a Markdown table.
 * @param text The text.
 * @returns The text on one line, with pipes escaped.
 */
function cell(text: string): string {
	return text.replaceAll("|", "\\|").replaceAll(/\s*\r?\n\s*/gu, " ");
}

/**
 * Where a finding is, for the table: its first piece of evidence, else its file.
 * @param finding The finding.
 * @returns The place.
 */
function where(finding: Finding): string {
	const first = finding.evidence[0];
	return first === undefined ? finding.file : `${first.path}:${String(first.line)}`;
}

/**
 * A finding code that links to its entry in the findings reference.
 * @param code The code.
 * @returns Markdown.
 */
function codeLink(code: string): string {
	return `[\`${cell(code)}\`](${findingDocsUrl(code)})`;
}

/**
 * The table of findings.
 * @param findings The findings.
 * @param allowed The codes that `allow-codes` lets through.
 * @returns The Markdown lines.
 */
function findingsTable(findings: readonly Finding[], allowed: ReadonlySet<string>): string[] {
	if (findings.length === 0) return [];
	const rows = findings
		.slice(0, TABLE_ROWS)
		.map(
			(finding) =>
				`| ${finding.level}${allowed.has(finding.code) ? " (allowed)" : ""} | ${codeLink(finding.code)} | ${cell(finding.subject ?? "")} | \`${cell(where(finding))}\` |`,
		);
	const more =
		findings.length > TABLE_ROWS
			? [``, `${String(findings.length - TABLE_ROWS)} more findings are in the report file.`]
			: [];
	return [
		"### Findings",
		"",
		"| Level | Code | Subject | Where |",
		"| --- | --- | --- | --- |",
		...rows,
		...more,
		"",
	];
}

/**
 * One finding with the evidence it rests on.
 * @param finding The finding.
 * @param locations Where files are on this machine.
 * @returns The Markdown lines.
 */
function findingDetail(finding: Finding, locations: Locations): string[] {
	const ends = evidenceDetails(finding, locations).flatMap((detail) => [
		`- ${detail.description}`,
		...(detail.excerpt === undefined
			? []
			: [
					"",
					"  ```text",
					...excerptText(detail.excerpt)
						.split("\n")
						.map((line) => `  ${line}`),
					"  ```",
					"",
				]),
	]);
	return [
		`#### ${codeLink(finding.code)}${finding.subject === undefined ? "" : `: ${cell(finding.subject)}`}`,
		"",
		finding.message,
		"",
		...ends,
	];
}

/**
 * What the check did not read, grouped by reason.
 * @param answer The answer of the command.
 * @returns The Markdown lines.
 */
function skippedSection(answer: CheckReading): string[] {
	const checks = answer.skipped === undefined ? [] : [`- ${answer.skipped.message}`];
	const reasons = skipReasons(answer.code?.skipped ?? []);
	return reasons.length + checks.length === 0
		? []
		: ["### Not checked", "", ...checks, ...reasons, ""];
}

/**
 * One line for each reason the code check skipped subjects, with a count and some names.
 * @param skipped The skips of the code check.
 * @returns The Markdown lines.
 */
function skipReasons(skipped: NonNullable<NonNullable<CheckReading["code"]>["skipped"]>): string[] {
	const groups = new Map<string, (typeof skipped)[number][]>();
	for (const skip of skipped) groups.set(skip.reason, [...(groups.get(skip.reason) ?? []), skip]);
	return [...groups].map(([reason, skips]) => {
		const names = skips.flatMap((skip) => skip.subject?.name ?? skip.repo ?? skip.model ?? []);
		const shown = names.slice(0, SKIPPED_NAMES).join(", ");
		const more = names.length > SKIPPED_NAMES ? ", …" : "";
		return `- \`${reason}\`: ${String(skips.length)}${shown === "" ? "" : ` (${shown}${more})`}`;
	});
}

/**
 * The job summary.
 * @param reading What the summary says.
 * @param reading.answer The answer of the command, or undefined when it printed none.
 * @param reading.findings Its findings.
 * @param reading.outcome Whether the step fails, and why.
 * @param reading.locations Where files are on this machine.
 * @param reading.allowed The codes that `allow-codes` lets through.
 * @returns The Markdown.
 */
function checkSummary(reading: {
	readonly answer: CheckReading | undefined;
	readonly findings: readonly Finding[];
	readonly outcome: Outcome;
	readonly locations: Locations;
	readonly allowed: ReadonlySet<string>;
}): string {
	const { answer, findings, outcome, locations, allowed } = reading;
	const counts = countFindings(findings);
	const errorsAndWarnings = findings.filter((finding) => finding.level !== "information");
	const detailed = errorsAndWarnings.slice(0, DETAILED_FINDINGS);
	const omittedDetails = errorsAndWarnings.length - detailed.length;
	return [
		"## Archboard check",
		"",
		`${outcome.failed ? "**Failed.**" : "**Passed.**"} ${outcome.reason}`,
		"",
		"| Errors | Warnings | Information |",
		"| ---: | ---: | ---: |",
		`| ${String(counts.errors)} | ${String(counts.warnings)} | ${String(counts.information)} |`,
		"",
		...findingsTable(findings, allowed),
		...(detailed.length === 0
			? []
			: ["### Evidence", "", ...detailed.flatMap((finding) => findingDetail(finding, locations))]),
		...(omittedDetails === 0
			? []
			: [
					"",
					`${String(omittedDetails)} more errors and warnings have evidence in the report file.`,
					"",
				]),
		...(answer === undefined ? [] : skippedSection(answer)),
	].join("\n");
}

export { checkSummary };
