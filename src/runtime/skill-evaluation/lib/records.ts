// From a batch directory to a comparison report: each run's manifest joined
// with the verdict each grader filed for it, one report per grader that
// graded the batch, how the graders agree, all written beside the batch.

import fs from "node:fs";
import path from "node:path";
import { resumeSelection } from "@/runtime/skill-evaluation/lib/batch";
import { RunManifestSchema, type RunManifest } from "@/runtime/skill-evaluation/lib/run-manifest";
import {
	checklistGaps,
	semanticallyCompliant,
	type RunVerdict,
} from "@/runtime/skill-evaluation/lib/grader";
import { suppliedCaptures } from "@/runtime/skill-evaluation/lib/grading-images";
import { visualStandingOf } from "@/runtime/skill-evaluation/lib/grader";
import { availableGraders } from "@/runtime/skill-evaluation/lib/grader-layout";
import {
	filedVerdict,
	graderIdentity,
	graderUsage,
} from "@/runtime/skill-evaluation/lib/grading-run";
import { agreementOf } from "@/runtime/skill-evaluation/lib/report-agreement";
import { renderBatchReportMarkdown } from "@/runtime/skill-evaluation/lib/report-markdown";
import { assertBatchInputs } from "@/runtime/skill-evaluation/lib/provenance";
import {
	buildReport,
	type BatchReport,
	type GraderReport,
	type RunRecord,
	type PlannedRun,
} from "@/runtime/skill-evaluation/lib/report";
import type { GraderName, LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

/**
 * Every run manifest under a batch.
 * @param batchRoot The batch.
 * @returns The manifests.
 */
function readManifests(batchRoot: string): RunManifest[] {
	return manifestFiles(path.join(batchRoot, "runs")).map((file) =>
		RunManifestSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))),
	);
}

/**
 * The manifest files under a batch's runs directory. A run keeps its whole
 * world, its author's transcript and its codex home beside the manifest, so a
 * batch's runs tree runs to tens of gigabytes; the layout is
 * `runs/<arm>/<scenario>/<repetition>/run.json`, so the three levels are read
 * by name and nothing below them is ever walked.
 * @param runs The batch's runs directory.
 * @returns The manifest paths, in directory order.
 */
function manifestFiles(runs: string): string[] {
	return directories(runs)
		.flatMap((arm) => directories(path.join(runs, arm)).map((scenario) => path.join(arm, scenario)))
		.flatMap((scenario) =>
			directories(path.join(runs, scenario)).map((repetition) =>
				path.join(runs, scenario, repetition, "run.json"),
			),
		)
		.filter((file) => fs.existsSync(file));
}

/**
 * The subdirectory names of one directory, without descending into them.
 * @param directory The directory, which need not exist.
 * @returns The names, empty when it does not.
 */
function directories(directory: string): string[] {
	if (!fs.existsSync(directory)) return [];
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

/**
 * What the grader's verdict says about a run's checklist, when there is one.
 * @param loaded The suite, for the expected features.
 * @param scenario The run's scenario id.
 * @param verdict The filed verdict, or null.
 * @returns Compliance, waived features and what the answer did with the checklist, unknown without a verdict.
 */
function gradedOf(
	loaded: LoadedSuite,
	scenario: string,
	verdict: RunVerdict | null,
): Pick<RunRecord, "semanticallyCompliant" | "waivedFeatures" | "checklist"> {
	if (verdict === null) return { semanticallyCompliant: null, waivedFeatures: [], checklist: null };
	const expected =
		loaded.suite.evals.find((candidate) => candidate.id === scenario)?.expectedFeatures ?? [];
	const gaps = checklistGaps(expected, verdict);
	// An answer that skipped declared features to grade names of its own is
	// about the grader, not the author: it can say neither that the run
	// complied nor that it did not.
	const offChecklist = gaps.unmentioned.length > 0 && gaps.invented.length > 0;
	return {
		semanticallyCompliant: offChecklist ? null : semanticallyCompliant(expected, verdict),
		waivedFeatures: gaps.waived,
		checklist: { unmentioned: gaps.unmentioned, invented: gaps.invented },
	};
}

/**
 * What the record says of the pictures: the captures the manifest recorded,
 * and the visual verdict as it stands against them.
 * @param batchRoot The batch.
 * @param grader The grader whose verdict this is, or null for an ungraded record.
 * @param manifest The manifest.
 * @param verdict The filed verdict, or null.
 * @returns The two fields.
 */
function visualOf(
	batchRoot: string,
	grader: GraderName | null,
	manifest: RunManifest,
	verdict: RunVerdict | null,
): Pick<RunRecord, "captures" | "visual"> {
	const captures = manifest.captures ?? null;
	const supplied = grader === null ? [] : suppliedCaptures(batchRoot, grader, manifest.run);
	return { captures, visual: visualStandingOf(captures, verdict, supplied) };
}

/**
 * The verdict one grader filed for a run, when a grader is asked.
 * @param batchRoot The batch.
 * @param grader The grader, or null.
 * @param run The anonymous id.
 * @returns The verdict, or null.
 */
function verdictFor(batchRoot: string, grader: GraderName | null, run: string): RunVerdict | null {
	return grader === null ? null : filedVerdict(batchRoot, grader, run);
}

/**
 * What a manifest recorded of the audit, each absent before its harness kept it.
 * @param manifest The manifest.
 * @returns The three audit fields, null where the manifest predates them.
 */
function auditOf(manifest: RunManifest): Pick<RunRecord, "directWrites" | "exposure" | "guidance"> {
	return {
		directWrites: manifest.directWrites ?? null,
		exposure: manifest.exposure ?? null,
		guidance: manifest.guidance ?? null,
	};
}

/**
 * One run's record, one grader's verdict joined in.
 * @param batchRoot The batch.
 * @param loaded The suite, for the expected features.
 * @param manifest The manifest.
 * @param grader The grader, or null for a record with no verdict.
 * @returns The record.
 */
function recordOf(
	batchRoot: string,
	loaded: LoadedSuite,
	manifest: RunManifest,
	grader: GraderName | null = null,
): RunRecord {
	const verdict = verdictFor(batchRoot, grader, manifest.run);
	const graded = gradedOf(loaded, manifest.scenario, verdict);
	return {
		run: manifest.run,
		arm: manifest.arm,
		scenario: manifest.scenario,
		workflow: manifest.workflow,
		report: manifest.report,
		repetition: manifest.repetition,
		status: manifest.status,
		durationMs: manifest.author?.durationMs ?? 0,
		usage: manifest.usage,
		commandCounts: manifest.commandCounts,
		...auditOf(manifest),
		...visualOf(batchRoot, grader, manifest, verdict),
		outcomesPassed: manifest.outcomesPassed,
		guardrailsPassed: manifest.guardrailsPassed,
		verdict,
		...graded,
	};
}

/**
 * Every job selected for the saved batch, whether it produced a manifest yet or not.
 * @param batchRoot The saved batch directory.
 * @param loaded The provenance-checked scenario suite.
 * @returns The planned run identities and reporting groups.
 */
function plannedRuns(batchRoot: string, loaded: LoadedSuite): PlannedRun[] {
	const selection = resumeSelection(batchRoot);
	return selection.arms.flatMap((arm) =>
		selection.scenarios.flatMap((id) => {
			const scenario = loaded.suite.evals.find((entry) => entry.id === id);
			if (scenario === undefined) throw new Error(`Unknown planned scenario ${id}`);
			return Array.from({ length: selection.repetitions }, (_, index) => ({
				arm,
				scenario: id,
				workflow: scenario.workflow,
				report: scenario.report,
				repetition: index + 1,
			}));
		}),
	);
}

/**
 * One grader's report over the batch.
 * @param batchRoot The batch.
 * @param loaded The suite.
 * @param manifests Every run manifest.
 * @param planned Every planned job.
 * @param grader The grader, or null when nothing was graded yet.
 * @returns The report with its records.
 */
function graderReport(
	batchRoot: string,
	loaded: LoadedSuite,
	manifests: readonly RunManifest[],
	planned: readonly PlannedRun[],
	grader: GraderName | null,
): GraderReport {
	const runs = manifests.map((manifest) => recordOf(batchRoot, loaded, manifest, grader));
	const identity = grader === null ? null : graderIdentity(batchRoot, grader);
	const usage = grader === null ? null : graderUsage(batchRoot, grader);
	return { grader: identity, report: buildReport(runs, usage, planned, identity), runs };
}

/**
 * Builds the whole batch report: one per grader that graded it, and their
 * agreement when two did. A batch nobody graded yet reports once, ungraded.
 * @param batchRoot The batch.
 * @param loaded The suite.
 * @returns The batch report.
 */
function buildBatchReport(batchRoot: string, loaded: LoadedSuite): BatchReport {
	const manifests = readManifests(batchRoot);
	const planned = plannedRuns(batchRoot, loaded);
	const names = availableGraders(batchRoot);
	const graders = (names.length === 0 ? [null] : names).map((name) =>
		graderReport(batchRoot, loaded, manifests, planned, name),
	);
	const [first, second] = graders;
	const agreement =
		first?.grader != null && second?.grader != null
			? agreementOf(
					{ grader: first.grader.name, runs: first.runs },
					{ grader: second.grader.name, runs: second.runs },
				)
			: null;
	return { graders, agreement };
}

/**
 * Builds and writes the comparison report for a batch.
 * @param batchRoot The batch.
 * @param loaded The suite.
 * @returns The report and where it was written.
 */
function writeReport(
	batchRoot: string,
	loaded: LoadedSuite,
): { readonly report: BatchReport; readonly markdown: string; readonly json: string } {
	assertBatchInputs(batchRoot, loaded);
	const report = buildBatchReport(batchRoot, loaded);
	const markdown = path.join(batchRoot, "report.md");
	const json = path.join(batchRoot, "report.json");
	fs.writeFileSync(markdown, renderBatchReportMarkdown(report));
	fs.writeFileSync(json, `${JSON.stringify(report, null, "\t")}\n`);
	return { report, markdown, json };
}

export {
	RunManifestSchema,
	buildBatchReport,
	readManifests,
	recordOf,
	writeReport,
	type RunManifest,
};
