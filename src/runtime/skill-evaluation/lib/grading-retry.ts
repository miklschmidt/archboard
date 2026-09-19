// The one retry a grading call gets: what the harness holds each run's
// answer to (the scenario's checklist and the captures taken, read from the
// run's manifest as the report reads them), whether an answer fell short of
// it by the report's own checks, the prompt that asks the same session again
// naming each run and exactly what it lacks, and whether the new answer
// mends it. Orchestration stays in grading-run.ts.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CaptureSummary } from "@/runtime/skill-evaluation/lib/captures";
import {
	checklistGaps,
	graderPrompt,
	unobservedCaptures,
	type GraderBrief,
	type RunVerdict,
} from "@/runtime/skill-evaluation/lib/grader";
import { combinedDelivery, type RunImages } from "@/runtime/skill-evaluation/lib/grading-images";
import { RunManifestSchema } from "@/runtime/skill-evaluation/lib/run-manifest";
import type { LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

/** What a verdict lacked, as a call records it. */
const ShortfallSchema = z.object({
	unanswered: z.array(z.string()),
	invented: z.array(z.string()),
	unobserved: z.array(z.string()),
});
/** One run a retry asked for again, as the retry's call records it. */
const RetriedRunSchema = z.object({
	run: z.string(),
	asked: ShortfallSchema,
	outcome: z.enum(["replaced", "still-short", "no-answer"]),
	/** What the new answer still lacked, when it came back short. */
	remaining: ShortfallSchema.nullable(),
});
type RetriedRun = z.infer<typeof RetriedRunSchema>;

/**
 * What a grader's answer for one run owes the harness and did not give: the
 * declared features it answered under no declared name, the names it
 * answered that the checklist does not hold, and the taken captures it gave
 * no observation of.
 */
interface VerdictShortfall {
	readonly run: string;
	readonly unanswered: readonly string[];
	readonly invented: readonly string[];
	readonly unobserved: readonly string[];
}

/**
 * Whether an answer met the harness's own obligations, read by the same
 * checks the report applies: `checklistGaps` for the checklist (behind
 * `checklistStanding` and compliance) and the capture reading behind
 * `visualStandingOf`. A lapse there sets a run aside or leaves its pictures
 * incomplete, so the grader is asked again rather than the run lost.
 * @param expected The scenario's checklist.
 * @param captures The run's capture record, or null when it recorded none.
 * @param verdict The grader's answer.
 * @param supplied Labels backed by successful delivery.
 * @returns What the answer lacks, or null when it lacks nothing.
 */
function verdictShortfall(
	expected: readonly { readonly feature: string }[],
	captures: CaptureSummary | null,
	verdict: RunVerdict,
	supplied: readonly string[],
): VerdictShortfall | null {
	const gaps = checklistGaps(expected, verdict);
	const unobserved = unobservedCaptures(captures, verdict.visual, supplied);
	return gaps.unmentioned.length === 0 && gaps.invented.length === 0 && unobserved.length === 0
		? null
		: { run: verdict.run, unanswered: gaps.unmentioned, invented: gaps.invented, unobserved };
}

/** What the harness holds a run's answer to, as the report reads it: the scenario's checklist and the captures taken. */
interface Obligations {
	readonly expected: readonly { readonly feature: string }[];
	readonly captures: CaptureSummary | null;
}

const ManifestObligationsSchema = RunManifestSchema.pick({ scenario: true, captures: true });

/**
 * What a run's answer must carry, from the run's manifest and the scenario
 * it names, read as the report reads them. The manifest stays with the batch
 * and is never staged for the grader.
 * @param loaded The suite, for the scenarios.
 * @param directory The run's directory under the batch.
 * @returns The obligations, or null for a run with no manifest or an unknown scenario, which the report cannot hold to any.
 */
function obligationsOf(loaded: LoadedSuite, directory: string): Obligations | null {
	const file = path.join(directory, "run.json");
	if (!fs.existsSync(file)) return null;
	const manifest = ManifestObligationsSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
	const scenario = loaded.suite.evals.find((entry) => entry.id === manifest.scenario);
	return scenario === undefined
		? null
		: { expected: scenario.expectedFeatures, captures: manifest.captures ?? null };
}

/**
 * What one run's answer must add when it is asked again.
 * @param shortfall What it lacks.
 * @returns One line naming the run and each thing missing.
 */
function shortfallLine(shortfall: VerdictShortfall): string {
	const parts = [
		shortfall.unanswered.length > 0 &&
			`answer each of these declared features under exactly this name, as its bundle.json checklist writes it: ${shortfall.unanswered.join(", ")}`,
		shortfall.invented.length > 0 &&
			`these names are not on its checklist, so answer none of them: ${shortfall.invented.join(", ")}`,
		shortfall.unobserved.length > 0 &&
			`open every listed picture of each of these captures, list it in \`visual.inspectedCaptures\` and give one \`visual.observations\` entry for it under its label: ${shortfall.unobserved.join(", ")}`,
	].filter((part) => part !== false);
	return `- ${shortfall.run}: ${parts.join("; ")}.`;
}

/**
 * The prompt that asks a session once more for the runs its answer fell
 * short on: a continuing call, naming each run and exactly what it lacks, and
 * then ending as every grading call does, pictures relisted.
 * @param brief What to say, `runs` being the runs asked again.
 * @param shortfalls What each of those runs lacks.
 * @returns The prompt text.
 */
function graderRetryPrompt(
	brief: Omit<GraderBrief, "continuing" | "preface">,
	shortfalls: readonly VerdictShortfall[],
): string {
	return graderPrompt({
		...brief,
		continuing: true,
		preface: [
			"Your last answer fell short of what the harness requires for the runs below. Answer each of them again, whole, in the same shape; keep every judgement you still hold, and add what is missing:",
			...shortfalls.map((shortfall) => shortfallLine(shortfall)),
			"",
		],
	});
}

/** A filed verdict that fell short, with what it is held to and what reached the grader for it. */
interface ShortAnswer {
	readonly shortfall: VerdictShortfall;
	readonly obligations: Obligations;
	readonly offered: RunImages;
	readonly delivered: RunImages | null;
}

/**
 * The filed verdicts of a call that fell short of the harness's obligations.
 * @param loaded The suite.
 * @param runs The runs of the call, with their directories.
 * @param filed The verdicts it filed.
 * @param offered The pictures it offered.
 * @param delivered What it vouched for.
 * @returns Each short answer.
 */
function shortAnswers(
	loaded: LoadedSuite,
	runs: readonly { readonly id: string; readonly directory: string }[],
	filed: readonly RunVerdict[],
	offered: readonly RunImages[],
	delivered: readonly RunImages[] | null,
): ShortAnswer[] {
	return filed.flatMap((verdict) => {
		const directory = runs.find((entry) => entry.id === verdict.run)?.directory;
		const images = offered.find((entry) => entry.run === verdict.run);
		const obligations = directory === undefined ? null : obligationsOf(loaded, directory);
		if (obligations === null || images === undefined) return [];
		const short = shortAnswer(obligations, verdict, images, delivered);
		return short === null ? [] : [short];
	});
}

/**
 * One filed verdict read against its obligations.
 * @param obligations What the run is held to.
 * @param verdict The verdict filed.
 * @param offered The pictures offered for the run.
 * @param delivered What the call vouched for.
 * @returns The short answer, or null when the verdict lacks nothing.
 */
function shortAnswer(
	obligations: Obligations,
	verdict: RunVerdict,
	offered: RunImages,
	delivered: readonly RunImages[] | null,
): ShortAnswer | null {
	const supplied = delivered?.find((entry) => entry.run === verdict.run) ?? null;
	const shortfall = verdictShortfall(
		obligations.expected,
		obligations.captures,
		verdict,
		supplied?.suppliedCaptures ?? [],
	);
	return shortfall === null ? null : { shortfall, obligations, offered, delivered: supplied };
}

/**
 * What a shortfall records, without its run.
 * @param shortfall The shortfall.
 * @returns Its three lists.
 */
function shortfallRecord(shortfall: VerdictShortfall): z.infer<typeof ShortfallSchema> {
	return {
		unanswered: [...shortfall.unanswered],
		invented: [...shortfall.invented],
		unobserved: [...shortfall.unobserved],
	};
}

/**
 * Judges one run's answer to the retry: it replaces the filed verdict only
 * when it lacks nothing. A picture delivered on the first call or on the
 * retry reached the same session, so the replacing verdict's receipt covers
 * both; an answer still short, or none, leaves the first verdict filed.
 * @param short The run's short answer.
 * @param answer What the retry answered for it, if anything.
 * @param delivered What the retry vouched for, or null.
 * @returns The run's retry record, and the verdict to file with its delivery when it replaces the first.
 */
function settleRetry(
	short: ShortAnswer,
	answer: RunVerdict | undefined,
	delivered: readonly RunImages[] | null,
): {
	readonly record: RetriedRun;
	readonly replacement: { readonly verdict: RunVerdict; readonly images: RunImages } | null;
} {
	const asked = shortfallRecord(short.shortfall);
	const run = short.shortfall.run;
	if (answer === undefined || delivered === null)
		return { record: { run, asked, outcome: "no-answer", remaining: null }, replacement: null };
	const images = combinedDelivery(short.offered, [
		short.delivered,
		delivered.find((entry) => entry.run === run),
	]);
	const remaining = verdictShortfall(
		short.obligations.expected,
		short.obligations.captures,
		answer,
		images.suppliedCaptures,
	);
	return remaining === null
		? {
				record: { run, asked, outcome: "replaced", remaining: null },
				replacement: { verdict: answer, images },
			}
		: {
				record: { run, asked, outcome: "still-short", remaining: shortfallRecord(remaining) },
				replacement: null,
			};
}

export {
	RetriedRunSchema,
	graderRetryPrompt,
	settleRetry,
	shortAnswers,
	verdictShortfall,
	type RetriedRun,
	type ShortAnswer,
	type VerdictShortfall,
};
