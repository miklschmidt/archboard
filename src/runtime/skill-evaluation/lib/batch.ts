// A comparison batch: every (arm, scenario, repetition) job run through a
// bounded pool with independent state, the pins held constant and checked
// against the tools actually present, and a manifest that records what ran.
// Cancellation stops every job's processes; a job's failure is a row.

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { executeRun, type RunJob } from "@/runtime/skill-evaluation/lib/author";
import { anonymousRunId, type Arm, type CompletedRun } from "@/runtime/skill-evaluation/lib/blind";
import { ensureFlaskCache } from "@/runtime/skill-evaluation/lib/flask";
import {
	assertProvenance,
	batchProvenance,
	type Provenance,
} from "@/runtime/skill-evaluation/lib/provenance";
import { keepBatchSkill } from "@/runtime/skill-evaluation/lib/citations";
import { digestOf } from "@/runtime/skill-evaluation/lib/install";
import type { LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";
import { executableVersion } from "@/runtime/skill-evaluation/lib/version";

/** What a batch is asked to do. */
interface BatchOptions {
	readonly loaded: LoadedSuite;
	readonly checkout: string;
	readonly output: string;
	readonly arms: readonly Arm[];
	readonly scenarios: readonly string[];
	readonly repetitions: number;
	readonly concurrency: number;
	readonly signal: AbortSignal;
	readonly log: (line: string) => void;
	readonly codexExecutable?: string | undefined;
	/** Reuse an existing batch directory, skipping runs that already completed. */
	readonly resume?: string | undefined;
}

/** A job before it runs. */
interface PlannedJob {
	readonly arm: Arm;
	readonly scenario: string;
	readonly repetition: number;
	readonly root: string;
}

const BatchManifestSchema = z
	.object({
		salt: z.string(),
		provenance: z.unknown(),
		arms: z.array(z.enum(["baseline", "candidate"])),
		scenarios: z.array(z.string()),
		repetitions: z.number(),
		codexExecutable: z.string(),
	})
	.passthrough();
const StatusSchema = z.object({ status: z.string() }).passthrough();

/**
 * Read a saved batch's job selection without changing it.
 * @param batchRoot The saved batch directory.
 * @returns Defaults for a resume invocation.
 */
function resumeSelection(
	batchRoot: string,
): Pick<BatchOptions, "arms" | "scenarios" | "repetitions" | "codexExecutable"> {
	const saved = BatchManifestSchema.parse(
		JSON.parse(fs.readFileSync(path.join(batchRoot, "batch.json"), "utf8")),
	);
	return {
		arms: saved.arms,
		scenarios: saved.scenarios,
		repetitions: saved.repetitions,
		codexExecutable: saved.codexExecutable,
	};
}

/**
 * Every job of the batch, in the order they are started.
 * @param options The batch.
 * @param root The batch directory.
 * @returns The jobs.
 */
function planJobs(options: BatchOptions, root: string): PlannedJob[] {
	return options.arms.flatMap((arm) =>
		options.scenarios.flatMap((scenario) =>
			Array.from({ length: options.repetitions }, (_, index) => ({
				arm,
				scenario,
				repetition: index + 1,
				root: path.join(root, "runs", arm, scenario, String(index + 1)),
			})),
		),
	);
}

/**
 * Whether a planned job already completed in this batch directory.
 * @param job The job.
 * @returns True when its run.json says completed.
 */
function alreadyDone(job: PlannedJob): boolean {
	const manifest = path.join(job.root, "run.json");
	if (!fs.existsSync(manifest)) return false;
	const parsed = StatusSchema.safeParse(JSON.parse(fs.readFileSync(manifest, "utf8")));
	return parsed.success && parsed.data.status === "completed";
}

/**
 * Runs jobs through a pool of the given width: each worker takes the next
 * job when it finishes its own.
 * @param jobs The jobs.
 * @param width How many at once.
 * @param run How to run one.
 * @param signal Cancellation.
 * @returns Every result, in job order.
 */
async function pool<T>(
	jobs: readonly PlannedJob[],
	width: number,
	run: (job: PlannedJob) => Promise<T>,
	signal: AbortSignal,
): Promise<T[]> {
	const results: T[] = [];
	let next = 0;
	/** One worker: takes jobs until none are left or the batch is cancelled. */
	const worker = async (): Promise<void> => {
		const index = next++;
		const job = jobs[index];
		if (job === undefined || signal.aborted) return;
		results[index] = await run(job);
		await worker();
	};
	await Promise.all(Array.from({ length: Math.max(1, width) }, worker));
	return results;
}

/**
 * The batch's salt: kept from an earlier manifest when resuming, else fresh.
 * @param manifestFile The manifest.
 * @returns The salt.
 */
function saltOf(manifestFile: string): string {
	if (!fs.existsSync(manifestFile)) return randomBytes(16).toString("hex");
	return BatchManifestSchema.parse(JSON.parse(fs.readFileSync(manifestFile, "utf8"))).salt;
}

/** The candidate package a batch kept, and the digest it recorded of it. */
interface KeptCandidate {
	readonly directory: string;
	readonly digest: string;
}

/**
 * The batch's copy of the candidate skill: kept now for a new batch, and for
 * a resumed one the copy it kept, checked against the digest it recorded when
 * it kept it. A copy edited since would be installed for the remaining runs
 * and pass grading's check if its digest were simply recorded again, so a
 * mismatch is refused before any job runs and the saved digest is kept.
 * @param skillRoot The candidate skill in the checkout.
 * @param root The batch.
 * @returns The kept copy and its digest.
 */
function keptCandidate(skillRoot: string, root: string): KeptCandidate {
	const manifest = path.join(root, "batch.json");
	const saved = fs.existsSync(manifest)
		? z
				.object({ candidateSkillDigest: z.string().optional() })
				.parse(JSON.parse(fs.readFileSync(manifest, "utf8"))).candidateSkillDigest
		: undefined;
	const directory = keepBatchSkill(skillRoot, root);
	const digest = digestOf(directory);
	if (saved !== undefined && saved !== digest)
		throw new Error(
			`${directory} changed after the batch kept it; restore it to the copy the batch recorded before resuming.`,
		);
	return { directory, digest };
}

/**
 * Writes the batch manifest and the private blinding table.
 * @param root The batch directory.
 * @param options The batch.
 * @param facts What to record.
 * @param facts.salt The batch salt.
 * @param facts.version The Codex version found.
 * @param facts.jobs The planned jobs.
 * @param facts.candidate The candidate package the batch kept, and its digest.
 * @param provenance The immutable implementation and input identities.
 */
function writeBatchFiles(
	root: string,
	options: BatchOptions,
	facts: {
		readonly salt: string;
		readonly version: string;
		readonly jobs: readonly PlannedJob[];
		readonly candidate: KeptCandidate;
	},
	provenance: Provenance,
): void {
	const manifest = {
		salt: facts.salt,
		writtenAt: new Date().toISOString(),
		codexVersion: facts.version,
		codexExecutable: options.codexExecutable ?? options.loaded.pins.codex.executable,
		pins: options.loaded.pins,
		arms: options.arms,
		scenarios: options.scenarios,
		repetitions: options.repetitions,
		concurrency: options.concurrency,
		archboard: options.checkout,
		provenance,
		/** The kept candidate's digest, which grading checks the copy it stages against. */
		candidateSkillDigest: facts.candidate.digest,
	};
	fs.writeFileSync(path.join(root, "batch.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	const blinding = facts.jobs.map((job) => ({
		run: anonymousRunId(facts.salt, job.arm, job.scenario, job.repetition),
		...job,
	}));
	fs.writeFileSync(path.join(root, "blinding.json"), `${JSON.stringify(blinding, null, "\t")}\n`);
}

/**
 * One job run, unless the batch is being resumed and it already completed.
 * @param options The batch.
 * @param job The job.
 * @param facts The salt, cache, frozen skill and batch directory.
 * @param facts.salt The batch salt.
 * @param facts.cache The Flask cache.
 * @param facts.frozenSkill The frozen baseline package.
 * @param facts.candidateSkill The candidate package the batch kept.
 * @param facts.batchRoot The batch directory every run lives under.
 * @returns The run, or null when kept from before.
 */
async function runJob(
	options: BatchOptions,
	job: PlannedJob,
	facts: {
		readonly salt: string;
		readonly cache: string;
		readonly frozenSkill: string;
		readonly candidateSkill: string;
		readonly batchRoot: string;
	},
): Promise<CompletedRun | null> {
	const scenario = options.loaded.suite.evals.find((candidate) => candidate.id === job.scenario);
	const fixture = options.loaded.fixtures.get(job.scenario);
	if (scenario === undefined || fixture === undefined)
		throw new Error(`unknown scenario ${job.scenario}`);
	if (options.resume !== undefined && alreadyDone(job)) {
		options.log(`${job.arm} ${job.scenario} #${job.repetition}: already completed, kept`);
		return null;
	}
	options.log(`${job.arm} ${job.scenario} #${job.repetition}: starting`);
	const request: RunJob = {
		arm: job.arm,
		scenario,
		fixture,
		repetition: job.repetition,
		root: job.root,
		batchRoot: facts.batchRoot,
		salt: facts.salt,
		checkout: options.checkout,
		cache: facts.cache,
		pins: {
			...options.loaded.pins,
			codex: {
				...options.loaded.pins.codex,
				executable: options.codexExecutable ?? options.loaded.pins.codex.executable,
			},
		},
		frozenSkill: facts.frozenSkill,
		candidateSkill: facts.candidateSkill,
		signal: options.signal,
	};
	const run = await executeRun(request);
	options.log(
		`${job.arm} ${job.scenario} #${job.repetition}: ${run.status}, outcomes ${run.outcomes.filter((v) => v.passed).length}/${run.outcomes.length}, guardrails ${run.guardrails.filter((v) => v.passed).length}/${run.guardrails.length}`,
	);
	return run;
}

/**
 * Reject job counts and selections that cannot form independent runs.
 * @param options The batch.
 */
function validateBatchOptions(options: BatchOptions): void {
	if (
		[options.repetitions, options.concurrency].some(
			(value) => !Number.isSafeInteger(value) || value < 1,
		)
	)
		throw new Error("repetitions and concurrency must be positive integers");
	for (const selection of [options.arms, options.scenarios]) {
		if (selection.length === 0 || new Set(selection).size !== selection.length)
			throw new Error("Select at least one unique arm and scenario; duplicate jobs share state.");
	}
}

/**
 * Preserve the original jobs as well as their content identities on resume.
 * @param options The requested batch.
 * @param provenance The current implementation identities.
 */
function validateResume(options: BatchOptions, provenance: Provenance): void {
	if (options.resume === undefined) return;
	const saved = BatchManifestSchema.parse(
		JSON.parse(fs.readFileSync(path.join(options.resume, "batch.json"), "utf8")),
	);
	assertProvenance(saved.provenance, provenance);
	const requested = {
		arms: options.arms,
		scenarios: options.scenarios,
		repetitions: options.repetitions,
		codexExecutable: options.codexExecutable ?? options.loaded.pins.codex.executable,
	};
	const selection = {
		arms: saved.arms,
		scenarios: saved.scenarios,
		repetitions: saved.repetitions,
		codexExecutable: saved.codexExecutable,
	};
	if (JSON.stringify(selection) !== JSON.stringify(requested))
		throw new Error(
			"Resume must keep the batch's arms, scenarios and repetitions. Start a new batch for different jobs.",
		);
}

/**
 * Runs one comparison batch after validating its immutable inputs.
 * @param options The batch.
 * @returns The batch directory and what ran.
 */
async function runBatch(
	options: BatchOptions,
): Promise<{ readonly root: string; readonly runs: readonly CompletedRun[] }> {
	const { loaded } = options;
	validateBatchOptions(options);
	const version = await executableVersion(options.codexExecutable ?? loaded.pins.codex.executable);
	if (version !== loaded.pins.codex.version)
		throw new Error(
			`pins.json pins codex ${loaded.pins.codex.version}; the executable reports ${version}. Update the pin deliberately, and start a new baseline.`,
		);
	const root =
		options.resume ?? path.join(options.output, new Date().toISOString().replaceAll(/[:.]/gu, "-"));
	// The skill is read twice in a row and never again: the provenance digests
	// it and the batch keeps its copy, which every candidate run installs from
	// and the grader reads, however long the batch then runs.
	const provenance = batchProvenance(options.checkout, loaded);
	validateResume(options, provenance);
	fs.mkdirSync(root, { recursive: true });
	const candidate = keptCandidate(path.join(options.checkout, "skills", "archboard"), root);
	const salt = saltOf(path.join(root, "batch.json"));
	const cache = path.join(options.output, "cache", "flask.git");
	await ensureFlaskCache(
		cache,
		loaded.pins.flask.repository,
		Object.values(loaded.pins.flask.revisions),
		options.signal,
	);
	const jobs = planJobs(options, root);
	writeBatchFiles(root, options, { salt, version, jobs, candidate }, provenance);
	const facts = {
		salt,
		cache,
		frozenSkill: path.join(options.checkout, loaded.pins.baselineSkill.location),
		candidateSkill: candidate.directory,
		batchRoot: root,
	};
	const runs = await pool(
		jobs,
		options.concurrency,
		(job) => runJob(options, job, facts),
		options.signal,
	);
	return { root, runs: runs.filter((run): run is CompletedRun => run !== null) };
}

export {
	keptCandidate,
	planJobs,
	resumeSelection,
	runBatch,
	type BatchOptions,
	type KeptCandidate,
};
