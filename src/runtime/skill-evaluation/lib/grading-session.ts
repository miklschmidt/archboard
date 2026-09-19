// What a grading pass records: its session in `session.json` (the runner's
// session id, what it ran under, and every call with its files, usage, what
// it filed and, for a retry, what it asked again), read back to continue the
// session and to count what it cost; and each run's verdict with its
// delivery receipt, filed from a call's structured answer.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	FiledVerdictSchema,
	parseGraderOutput,
	type RunVerdict,
} from "@/runtime/skill-evaluation/lib/grader";
import { graderLayout, type GraderLayout } from "@/runtime/skill-evaluation/lib/grader-layout";
import {
	fileImageReceipt,
	imagesForRun,
	readReceipt,
	type RunImages,
} from "@/runtime/skill-evaluation/lib/grading-images";
import type { UsageSemantics } from "@/runtime/skill-evaluation/lib/grader-runner";
import { RetriedRunSchema, type FiledEvidence } from "@/runtime/skill-evaluation/lib/grading-retry";
import { GRADER_NAMES, type GraderName } from "@/runtime/skill-evaluation/lib/suite";

const UsageSchema = z.object({
	input: z.number(),
	cached: z.number(),
	cacheWrite: z.number().nullable(),
	output: z.number(),
	reasoning: z.number().nullable(),
	total: z.number(),
});
const CallSchema = z.object({
	index: z.number(),
	runs: z.array(z.string()),
	promptFile: z.string(),
	verdictFile: z.string(),
	eventsFile: z.string(),
	exitCode: z.number().nullable(),
	/**
	 * What the call reported, under the runner's semantics: a Codex resumed
	 * thread reports its cumulative usage so far; a Claude call reports its own.
	 */
	usage: UsageSchema.nullable(),
	/** This call's own usage. Absent in sessions recorded before TASK-212. */
	callUsage: UsageSchema.nullable().optional(),
	/** The runner's raw usage record, kept beside the normalized one. Claude only. */
	raw: z
		.object({ usage: z.unknown(), modelUsage: z.unknown(), costUsd: z.number().nullable() })
		.nullable()
		.optional(),
	graded: z.array(z.string()),
	error: z.string().nullable(),
	/**
	 * Present on a call that asked the session again for the runs an earlier
	 * call's answer fell short on: which call, what each run lacked, and
	 * whether its answer replaced the filed verdict. Its `graded` lists the
	 * runs whose verdict it replaced.
	 */
	retry: z.object({ of: z.number(), runs: z.array(RetriedRunSchema) }).optional(),
});
type GradingCall = z.infer<typeof CallSchema>;
const SessionSchema = z.object({
	/** The runner's session identity: a Codex thread id or a Claude session id. */
	threadId: z.string().nullable(),
	/** Absent in sessions recorded before there was a choice; those are Codex. */
	runner: z.enum(GRADER_NAMES).optional(),
	version: z.string().optional(),
	settings: z.record(z.string(), z.unknown()).optional(),
	calls: z.array(CallSchema),
});
type GradingSession = z.infer<typeof SessionSchema>;

/**
 * The session as last written, or a fresh one.
 * @param file The session file.
 * @returns The session.
 */
function readSession(file: string): GradingSession {
	return fs.existsSync(file)
		? SessionSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: { threadId: null, calls: [] };
}

/**
 * The usage semantics a recorded session was written under.
 * @param session The session.
 * @returns Cumulative for Codex and for sessions recorded before the choice.
 */
function semanticsOf(session: GradingSession): UsageSemantics {
	return session.runner === "claude" ? "per-call" : "cumulative";
}

/**
 * Files one run's verdict and, only for a successful call, its delivery
 * receipt, written after the verdict so it hashes the bytes filed.
 * @param layout The grading layout.
 * @param verdict The verdict.
 * @param images What reached the grader for this run, or null when nothing can be vouched for.
 */
function fileVerdict(layout: GraderLayout, verdict: RunVerdict, images: RunImages | null): void {
	const file = path.join(layout.verdicts, `${verdict.run}.json`);
	fs.writeFileSync(file, `${JSON.stringify(verdict, null, "\t")}\n`);
	fileImageReceipt(file, images);
}

/**
 * A call's structured answer, read against the contract.
 * @param verdictFile The answer file.
 * @returns The run verdicts, and what went wrong reading them.
 */
function readAnswer(verdictFile: string): {
	readonly runs: readonly RunVerdict[];
	readonly error: string | null;
} {
	if (!fs.existsSync(verdictFile))
		return { runs: [], error: "the grader returned no structured answer" };
	try {
		return { runs: parseGraderOutput(fs.readFileSync(verdictFile, "utf8")).runs, error: null };
	} catch (error) {
		return { runs: [], error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Files each run's verdict from a call's structured answer.
 * @param layout The grading layout.
 * @param verdictFile The answer file.
 * @param asked The runs the call was asked to grade.
 * @param images Delivery evidence, only when the call completed successfully.
 * @returns What was filed, and what went wrong reading the answer.
 */
function fileVerdicts(
	layout: GraderLayout,
	verdictFile: string,
	asked: readonly string[],
	images: readonly RunImages[] | null,
): { readonly filed: readonly RunVerdict[]; readonly error: string | null } {
	const answer = readAnswer(verdictFile);
	if (answer.error !== null) return { filed: [], error: answer.error };
	const filed = answer.runs.filter((verdict) => asked.includes(verdict.run));
	for (const verdict of filed)
		fileVerdict(layout, verdict, images?.find((run) => run.run === verdict.run) ?? null);
	const missing = asked.filter((id) => !filed.some((verdict) => verdict.run === id));
	return {
		filed,
		error: missing.length === 0 ? null : `the grader returned no verdict for ${missing.join(", ")}`,
	};
}

/* A filed verdict is read leniently: one filed before captures existed carries no visual answer. */
/**
 * The verdict one grader filed for one run, if any.
 * @param batchRoot The batch.
 * @param grader The grader.
 * @param id The anonymous id.
 * @returns The verdict, or null.
 */
function filedVerdict(batchRoot: string, grader: GraderName, id: string): RunVerdict | null {
	const file = path.join(graderLayout(batchRoot, grader).verdicts, `${id}.json`);
	return fs.existsSync(file)
		? FiledVerdictSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
}

/**
 * A grader's filed evidence for the runs of a batch, as the owed retries read it.
 * @param batchRoot The batch.
 * @param grader The grader.
 * @returns The readers.
 */
function filedEvidence(batchRoot: string, grader: GraderName): FiledEvidence {
	return {
		/**
		 * The verdict filed for a run.
		 * @param run The run.
		 * @returns The verdict, or null.
		 */
		verdict(run) {
			return filedVerdict(batchRoot, grader, run);
		},
		/**
		 * What the harness offers for a run.
		 * @param run The run.
		 * @returns The pictures.
		 */
		offered(run) {
			return imagesForRun(graderLayout(batchRoot, grader).workspace, run);
		},
		/**
		 * What a run's receipt says reached the grader.
		 * @param run The run.
		 * @returns The delivery, or null.
		 */
		receipt(run) {
			return readReceipt(batchRoot, grader, run);
		},
	};
}

export {
	UsageSchema,
	filedEvidence,
	filedVerdict,
	fileVerdict,
	fileVerdicts,
	readAnswer,
	readSession,
	semanticsOf,
	type GradingCall,
	type GradingSession,
};
