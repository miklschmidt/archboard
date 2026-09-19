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
const SHORTFALL_LISTS = ["unanswered", "invented", "unobserved"] as const;
/** One run a retry asked for again, as the retry's call records it. */
const RetriedRunSchema = z.object({
	run: z.string(),
	asked: ShortfallSchema,
	outcome: z.enum(["replaced", "still-short", "no-answer"]),
	/** What the answer to the retry still lacked, whether or not it replaced the verdict. */
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
	const supplied = deliveryFor(delivered, verdict.run);
	const shortfall = askable(
		owedOf(
			verdictShortfall(obligations.expected, obligations.captures, verdict, labelsOf(supplied)),
			offered,
		),
	);
	return shortfall === null ? null : { shortfall, obligations, offered, delivered: supplied };
}

/**
 * One run's delivery among a call's.
 * @param delivered What the call vouched for, or null.
 * @param run The run.
 * @returns The run's delivery, or null.
 */
function deliveryFor(delivered: readonly RunImages[] | null, run: string): RunImages | null {
	return delivered?.find((entry) => entry.run === run) ?? null;
}

/**
 * The captures a delivery supplied.
 * @param delivery The delivery, or null.
 * @returns Their labels.
 */
function labelsOf(delivery: RunImages | null): readonly string[] {
	return delivery?.suppliedCaptures ?? [];
}

/**
 * A shortfall worth a retry, or null.
 * @param shortfall What an answer owes, or null.
 * @returns The shortfall when it is worth asking about.
 */
function askable(shortfall: VerdictShortfall | null): VerdictShortfall | null {
	return shortfall !== null && worthAsking(shortfall) ? shortfall : null;
}

/**
 * What a shortfall owes that an answer could give: a capture the harness
 * could not offer the grader is left out, since no answer can observe it.
 * @param shortfall The report's reading of an answer.
 * @param offered What the harness offered for the run.
 * @returns The shortfall without unoffered captures, or null when there was none.
 */
function owedOf(shortfall: VerdictShortfall | null, offered: RunImages): VerdictShortfall | null {
	return shortfall === null
		? null
		: {
				...shortfall,
				unobserved: shortfall.unobserved.filter((label) =>
					offered.suppliedCaptures.includes(label),
				),
			};
}

/**
 * Whether a shortfall changes what the report reads: a declared feature
 * unanswered or an offered capture unobserved. A name invented beside every
 * declared one changes nothing the report reads, and a retry redraws the
 * whole verdict, so it alone is not asked about.
 * @param shortfall What an answer lacks.
 * @returns Whether to ask again.
 */
function worthAsking(shortfall: VerdictShortfall): boolean {
	return shortfall.unanswered.length > 0 || shortfall.unobserved.length > 0;
}

/**
 * Whether what an answer still lacks is a strict part of what it was asked
 * for: every lapse left was one asked about, and fewer remain. Such an answer
 * is never worse by the report's checks than the one it replaces.
 * @param remaining What the new answer lacks.
 * @param asked What the retry asked for.
 * @returns Whether it is an improvement.
 */
function improves(remaining: VerdictShortfall, asked: VerdictShortfall): boolean {
	const within = SHORTFALL_LISTS.every((list) =>
		remaining[list].every((entry) => asked[list].includes(entry)),
	);
	return within && sizeOf(remaining) < sizeOf(asked);
}

/**
 * How many lapses a shortfall counts.
 * @param shortfall The shortfall.
 * @returns The number of entries across its lists.
 */
function sizeOf(shortfall: VerdictShortfall): number {
	return SHORTFALL_LISTS.reduce((total, list) => total + shortfall[list].length, 0);
}

/**
 * What a shortfall records, without its run.
 * @param shortfall The shortfall.
 * @returns Its three lists.
 */
function shortfallRecord(shortfall: VerdictShortfall): z.infer<typeof ShortfallSchema>;
function shortfallRecord(
	shortfall: VerdictShortfall | null,
): z.infer<typeof ShortfallSchema> | null;
function shortfallRecord(
	shortfall: VerdictShortfall | null,
): z.infer<typeof ShortfallSchema> | null {
	if (shortfall === null) return null;
	return {
		unanswered: [...shortfall.unanswered],
		invented: [...shortfall.invented],
		unobserved: [...shortfall.unobserved],
	};
}

/**
 * Judges one run's answer to the retry: it replaces the filed verdict when
 * it lacks nothing the report reads, or lacks a strict part of what was
 * asked. A picture delivered on the first call or on the retry reached the
 * same session, so the replacing verdict's receipt covers both; any other
 * answer, or none, leaves the first verdict filed.
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
	const images = combinedDelivery(short.offered, [short.delivered, deliveryFor(delivered, run)]);
	const remaining = owedOf(
		verdictShortfall(
			short.obligations.expected,
			short.obligations.captures,
			answer,
			images.suppliedCaptures,
		),
		short.offered,
	);
	const replaces = mends(remaining, short.shortfall);
	return {
		record: {
			run,
			asked,
			outcome: replaces ? "replaced" : "still-short",
			remaining: shortfallRecord(remaining),
		},
		replacement: replaces ? { verdict: answer, images } : null,
	};
}

/**
 * Whether an answer to the retry is fit to replace the first: it lacks
 * nothing the report reads, or only a strict part of what was asked.
 * @param remaining What it still owes, or null.
 * @param asked What the retry asked for.
 * @returns Whether it replaces the first verdict.
 */
function mends(remaining: VerdictShortfall | null, asked: VerdictShortfall): boolean {
	return askable(remaining) === null || improves(remaining ?? asked, asked);
}

/** A run as the batch holds it: its anonymous id and its directory. */
interface StagedRun {
	readonly id: string;
	readonly directory: string;
}

/** How the owed retries read a run's filed evidence. */
interface FiledEvidence {
	/** The verdict filed for the run, if any. */
	verdict(run: string): RunVerdict | null;
	/** What the harness offers the grader for the run. */
	offered(run: string): RunImages;
	/** What the filed verdict's receipt says reached the grader, if it still vouches for it. */
	receipt(run: string): RunImages | null;
}

/**
 * The filed verdicts still owed their one retry, by the call that filed
 * them: short by the report's checks and named by no retry record. A pass
 * interrupted between a call and its retry leaves these, and so does a batch
 * graded before retries existed; what first reached the grader is read back
 * from each verdict's receipt.
 * @param loaded The suite.
 * @param calls The session's calls so far.
 * @param runs Every bundled run, with its directory.
 * @param filed How to read each run's filed evidence.
 * @returns The short answers, grouped by the number of the call that filed each verdict.
 */
function owedRetries(
	loaded: LoadedSuite,
	calls: readonly {
		readonly index: number;
		readonly graded: readonly string[];
		readonly retry?: { readonly runs: readonly { readonly run: string }[] } | undefined;
	}[],
	runs: readonly { readonly id: string; readonly directory: string }[],
	filed: FiledEvidence,
): Map<number, ShortAnswer[]> {
	const asked = new Set(calls.flatMap((call) => call.retry?.runs ?? []).map((entry) => entry.run));
	const owed = new Map<number, ShortAnswer[]>();
	for (const run of runs.filter((entry) => !asked.has(entry.id))) {
		const of = calls.findLast((call) => call.graded.includes(run.id));
		const short = of === undefined ? null : owedFor(loaded, run, filed);
		if (of !== undefined && short !== null)
			owed.set(of.index, [...(owed.get(of.index) ?? []), short]);
	}
	return owed;
}

/**
 * One run's filed verdict read against its obligations, with what its
 * receipt says first reached the grader.
 * @param loaded The suite.
 * @param run The run, with its directory.
 * @param filed How to read its filed evidence.
 * @returns The short answer, or null when there is no verdict, nothing to hold it to, or nothing owed.
 */
function owedFor(loaded: LoadedSuite, run: StagedRun, filed: FiledEvidence): ShortAnswer | null {
	const verdict = filed.verdict(run.id);
	const obligations = verdict === null ? null : obligationsOf(loaded, run.directory);
	if (verdict === null || obligations === null) return null;
	const receipt = filed.receipt(run.id);
	return shortAnswer(
		obligations,
		verdict,
		filed.offered(run.id),
		receipt === null ? null : [receipt],
	);
}

export {
	RetriedRunSchema,
	graderRetryPrompt,
	owedRetries,
	settleRetry,
	shortAnswers,
	verdictShortfall,
	type FiledEvidence,
	type RetriedRun,
	type ShortAnswer,
	type VerdictShortfall,
};
