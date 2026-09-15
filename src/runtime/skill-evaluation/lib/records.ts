// From a batch directory to a comparison report: each run's manifest joined
// with the verdict the grader filed for it, then the report built and written
// beside the batch.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resumeSelection } from "@/runtime/skill-evaluation/lib/batch";
import {
	checklistGaps,
	semanticallyCompliant,
	type RunVerdict,
} from "@/runtime/skill-evaluation/lib/grader";
import { suppliedCaptures } from "@/runtime/skill-evaluation/lib/grading-images";
import { visualStandingOf } from "@/runtime/skill-evaluation/lib/grader";
import { filedVerdict, graderUsage } from "@/runtime/skill-evaluation/lib/grading-run";
import { assertBatchInputs } from "@/runtime/skill-evaluation/lib/provenance";
import {
	buildReport,
	renderReportMarkdown,
	type Report,
	type RunRecord,
	type PlannedRun,
} from "@/runtime/skill-evaluation/lib/report";
import type { LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

const UsageSchema = z.object({
	input: z.number(),
	cached: z.number(),
	cacheWrite: z.number().nullable(),
	output: z.number(),
	reasoning: z.number().nullable(),
	total: z.number(),
});

/** A run manifest as run.json holds it, as far as the report reads it. */
const RunManifestSchema = z
	.object({
		run: z.string(),
		arm: z.enum(["baseline", "candidate"]),
		scenario: z.string(),
		workflow: z.string(),
		report: z.enum(["primary", "broad"]),
		repetition: z.number(),
		status: z.enum(["completed", "failed", "timed-out", "cancelled"]),
		author: z.object({ durationMs: z.number() }).passthrough().optional(),
		usage: UsageSchema.nullable(),
		commandCounts: z.object({
			discovery: z.number(),
			operation: z.number(),
			"code-investigation": z.number(),
			setup: z.number(),
			ambiguous: z.number(),
		}),
		// Absent from manifests written before the evidence repair (TASK-212);
		// such a run recorded neither, and the report says so rather than guessing.
		directWrites: z.number().optional(),
		exposure: z
			.object({
				"evaluation-inputs": z.number(),
				"harness-source": z.number(),
				"other-run": z.number(),
			})
			.optional(),
		// Absent from manifests written before captures were taken (TASK-214);
		// such a run has no picture the grader could have looked at.
		captures: z
			.object({
				declared: z.array(z.string()),
				captured: z.array(z.string()),
				failed: z.array(z.string()),
			})
			.optional(),
		outcomesPassed: z.boolean(),
		guardrailsPassed: z.boolean(),
	})
	.passthrough();
type RunManifest = z.infer<typeof RunManifestSchema>;

/**
 * Every run manifest under a batch.
 * @param batchRoot The batch.
 * @returns The manifests.
 */
function readManifests(batchRoot: string): RunManifest[] {
	const runs = path.join(batchRoot, "runs");
	if (!fs.existsSync(runs)) return [];
	return fs
		.readdirSync(runs, { recursive: true })
		.map(String)
		.filter((entry) => entry.endsWith("run.json"))
		.map((entry) =>
			RunManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(runs, entry), "utf8"))),
		);
}

/**
 * What the grader's verdict says about a run's checklist, when there is one.
 * @param loaded The suite, for the expected features.
 * @param scenario The run's scenario id.
 * @param verdict The filed verdict, or null.
 * @returns Compliance and waived features, unknown without a verdict.
 */
function gradedOf(
	loaded: LoadedSuite,
	scenario: string,
	verdict: RunVerdict | null,
): Pick<RunRecord, "semanticallyCompliant" | "waivedFeatures"> {
	if (verdict === null) return { semanticallyCompliant: null, waivedFeatures: [] };
	const expected =
		loaded.suite.evals.find((candidate) => candidate.id === scenario)?.expectedFeatures ?? [];
	return {
		semanticallyCompliant: semanticallyCompliant(expected, verdict),
		waivedFeatures: checklistGaps(expected, verdict).waived,
	};
}

/**
 * What the record says of the pictures: the captures the manifest recorded,
 * and the visual verdict as it stands against them.
 * @param batchRoot The batch.
 * @param manifest The manifest.
 * @param verdict The filed verdict, or null.
 * @returns The two fields.
 */
function visualOf(
	batchRoot: string,
	manifest: RunManifest,
	verdict: RunVerdict | null,
): Pick<RunRecord, "captures" | "visual"> {
	const captures = manifest.captures ?? null;
	return {
		captures,
		visual: visualStandingOf(captures, verdict, suppliedCaptures(batchRoot, manifest.run)),
	};
}

/**
 * One run's record, its verdict joined in.
 * @param batchRoot The batch.
 * @param loaded The suite, for the expected features.
 * @param manifest The manifest.
 * @returns The record.
 */
function recordOf(batchRoot: string, loaded: LoadedSuite, manifest: RunManifest): RunRecord {
	const verdict = filedVerdict(batchRoot, manifest.run);
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
		directWrites: manifest.directWrites ?? null,
		exposure: manifest.exposure ?? null,
		...visualOf(batchRoot, manifest, verdict),
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
 * Builds and writes the comparison report for a batch.
 * @param batchRoot The batch.
 * @param loaded The suite.
 * @returns The report and where it was written.
 */
function writeReport(
	batchRoot: string,
	loaded: LoadedSuite,
): { readonly report: Report; readonly markdown: string; readonly json: string } {
	assertBatchInputs(batchRoot, loaded);
	const records = readManifests(batchRoot).map((manifest) => recordOf(batchRoot, loaded, manifest));
	const report = buildReport(records, graderUsage(batchRoot), plannedRuns(batchRoot, loaded));
	const markdown = path.join(batchRoot, "report.md");
	const json = path.join(batchRoot, "report.json");
	fs.writeFileSync(markdown, renderReportMarkdown(report));
	fs.writeFileSync(json, `${JSON.stringify({ report, runs: records }, null, "\t")}\n`);
	return { report, markdown, json };
}

export { RunManifestSchema, readManifests, recordOf, writeReport, type RunManifest };
