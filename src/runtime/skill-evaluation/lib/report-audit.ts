// What the audit of a run says in the report: whether its author read the
// material it was measured against or reached another run, whether it wrote a
// board file outside the CLI, and whether the run was recorded before the
// harness kept either. Kept beside the comparison so the report can say it
// without folding it into the board's correctness.

import type { Report, RunRecord } from "@/runtime/skill-evaluation/lib/report";

/**
 * Whether a run's author reached for material it was being measured against.
 * @param run The run.
 * @returns True when any command did.
 */
function contaminated(run: RunRecord): boolean {
	return run.exposure !== null && Object.values(run.exposure).some((count) => count > 0);
}

/**
 * Whether a run's author changed a board file outside the CLI.
 * @param run The run.
 * @returns True when the trace holds such a change.
 */
function wroteDirectly(run: RunRecord): boolean {
	return run.directWrites !== null && run.directWrites > 0;
}

/**
 * Whether a run's audit could not be carried out: it was recorded before
 * the harness kept file changes and exposure.
 * @param run The run.
 * @returns True when the manifest lacks either.
 */
function unaudited(run: RunRecord): boolean {
	return run.directWrites === null || run.exposure === null;
}

/**
 * What a run's audit found: direct writes, evaluation material read, or that
 * the run predates the audit.
 * @param run The run.
 * @returns Zero or more reasons.
 */
function auditReasons(run: RunRecord): string[] {
	if (unaudited(run)) return ["recorded before file changes and exposure were kept"];
	const exposure = Object.entries(run.exposure ?? {})
		.filter(([, count]) => count > 0)
		.map(([kind, count]) => `${kind} ×${count}`);
	return [
		...(wroteDirectly(run) ? [`wrote ${run.directWrites} board files outside the CLI`] : []),
		...(exposure.length === 0 ? [] : [`read evaluation material: ${exposure.join(", ")}`]),
	];
}

/**
 * One line saying how many runs the audit could not reach, when any.
 * @param report The report.
 * @returns Zero or one markdown lines.
 */
function unauditedLine(report: Report): string[] {
	const count = [...report.scenarios, ...report.broad].reduce(
		(sum, row) => sum + row.baseline.unaudited + row.candidate.unaudited,
		0,
	);
	return count === 0
		? []
		: [
				`- ${count} runs were recorded before file changes and exposure were kept; they cannot be audited for direct writes or evaluation-material reads`,
			];
}

/**
 * One line about a contaminated run.
 * @param run The run.
 * @returns The markdown line.
 */
function contaminationLine(run: RunRecord): string {
	return `- ${run.run} (${run.arm}, ${run.scenario} rep ${run.repetition}): ${auditReasons(run).join(", ")}`;
}

export { auditReasons, contaminated, contaminationLine, unaudited, unauditedLine, wroteDirectly };
