// The seam between one grading session and the program that runs it. A
// grader is chosen when grading runs (`--grader codex|claude`), never when a
// batch's authors run, so the same batch can be graded by both. Each runner
// turns the shared prompt into its own command line, hands back the session
// id to resume, the events it retained, what the call cost under its own
// usage semantics, and the images it can vouch for.

import type { ProcessResult } from "@/runtime/skill-evaluation/lib/process";
import type { Usage } from "@/runtime/skill-evaluation/lib/events";
import type { RunImages } from "@/runtime/skill-evaluation/lib/grading-images";
import type { GraderName } from "@/runtime/skill-evaluation/lib/suite";

/** How a runner reports usage: Codex counts the thread so far, Claude counts the call. */
type UsageSemantics = "cumulative" | "per-call";
/** How pictures reach the grader: attached to the prompt, or opened from the workspace. */
type ImageDelivery = "attached" | "workspace";

/** What one grading call is asked to do, in runner-neutral terms. */
interface GraderCall {
	/** The staged read-only workspace the grader runs in. */
	readonly workspace: string;
	/** The shared user prompt. */
	readonly prompt: string;
	/** The JSON Schema file the structured answer must match. */
	readonly schemaFile: string;
	/** Where the structured answer must end up, whoever writes it. */
	readonly verdictFile: string;
	/** The validated images of the runs in this call. */
	readonly images: readonly RunImages[];
	/** The session to continue, or null for the first call. */
	readonly sessionId: string | null;
	readonly timeoutMs: number;
	readonly signal: AbortSignal;
}

/** The raw usage a runner reported, kept beside the normalized reading. */
interface RawUsage {
	readonly usage: unknown;
	readonly modelUsage: unknown;
	readonly costUsd: number | null;
}

/** What a call yielded. */
interface GraderCallOutcome {
	readonly result: ProcessResult;
	/** The event stream as retained; a runner may redact bulky payloads it re-reads from disk. */
	readonly events: string;
	/** The session the call ran in, once known. */
	readonly sessionId: string | null;
	/** The usage the runner reported, under its own semantics. */
	readonly usage: Usage | null;
	readonly raw: RawUsage | null;
	/** Why the call failed as a protocol, when the process alone does not say. */
	readonly failure: string | null;
	/** The images this call can vouch for reaching the grader; null when the call cannot vouch for any. */
	readonly delivered: readonly RunImages[] | null;
}

/** One grader runner, chosen by name. */
interface GraderRunner {
	readonly name: GraderName;
	readonly executable: string;
	readonly pinnedVersion: string;
	readonly usageSemantics: UsageSemantics;
	readonly delivery: ImageDelivery;
	/** What the session records it ran under. */
	readonly settings: Readonly<Record<string, unknown>>;
	/** Makes the grader's private home under the grading root, when it has one. */
	prepare(root: string, workspace: string): void;
	call(request: GraderCall): Promise<GraderCallOutcome>;
}

/** What a grading session is, as the report names it. */
interface GraderIdentity {
	readonly name: GraderName;
	readonly semantics: UsageSemantics;
	/** The model the session recorded, when it recorded its settings. */
	readonly model: string | null;
}

/**
 * Whether a call finished cleanly enough to vouch for what reached the grader.
 * @param result The process outcome.
 * @param failure The protocol failure, if any.
 * @returns True for a successful, uninterrupted call.
 */
function callSucceeded(result: ProcessResult, failure: string | null): boolean {
	return result.exitCode === 0 && !result.timedOut && !result.cancelled && failure === null;
}

export {
	callSucceeded,
	type GraderCall,
	type GraderCallOutcome,
	type GraderIdentity,
	type GraderRunner,
	type ImageDelivery,
	type RawUsage,
	type UsageSemantics,
};
