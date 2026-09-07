// The errors a renderer raises, each carrying the evidence the proof reads.
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { describeValue, errorMessage, type JsonRecord } from "./proof-values.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import type { CleanupAudit } from "./renderer-process.ts";

/** A renderer job that failed, with the page's own account of where. */
class RendererJobError extends Error {
	readonly job: string;
	readonly phase: JsonRecord;
	readonly diagnostics: JsonRecord[];
	readonly proof: JsonRecord;

	/**
	 * Describe the failed job.
	 * @param job The job name.
	 * @param phase The page's proof state when it failed.
	 * @param diagnostics The page diagnostics collected so far.
	 * @param proof The page's proof state, repeated for the report.
	 * @param cause The underlying error.
	 */
	constructor(
		job: string,
		phase: JsonRecord,
		diagnostics: JsonRecord[],
		proof: JsonRecord,
		cause: unknown,
	) {
		super(
			`Renderer ${job} failed in phase ${describeValue(phase["phase"] ?? "unknown")}: ${errorMessage(cause)}; ` +
				`page diagnostics=${JSON.stringify(diagnostics)}; proof=${JSON.stringify(proof)}`,
			{ cause },
		);
		this.name = "RendererJobError";
		this.job = job;
		this.phase = phase;
		this.diagnostics = diagnostics;
		this.proof = proof;
	}
}

type TimeoutOracleReason = "job" | "phase" | "cause" | "method" | "duration";

/** The intentional-timeout oracle refused a failure as not being the timeout. */
class TimeoutOracleRejectionError extends Error {
	readonly reason: TimeoutOracleReason;

	/**
	 * Name what did not match.
	 * @param reason The mismatched aspect.
	 * @param cause The failure that was examined.
	 */
	constructor(reason: TimeoutOracleReason, cause: unknown) {
		const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
		super(
			`Intentional timeout oracle rejected the job because its ${reason} did not match: ${detail}`,
			{ cause },
		);
		this.name = "TimeoutOracleRejectionError";
		this.reason = reason;
	}
}

/** Renderer acquisition failed at a stage, after cleanup ran. */
class RendererAcquisitionError extends Error {
	readonly stage: string;
	readonly cleanup: CleanupAudit;

	/**
	 * Describe the failed acquisition.
	 * @param stage The stage that failed.
	 * @param cleanup The cleanup audit that followed.
	 * @param cause The underlying error.
	 */
	constructor(stage: string, cleanup: CleanupAudit, cause: unknown) {
		super(`Renderer acquisition failed at ${stage}; cleanup=${JSON.stringify(cleanup)}`, { cause });
		this.name = "RendererAcquisitionError";
		this.stage = stage;
		this.cleanup = cleanup;
	}
}

export { RendererAcquisitionError, RendererJobError, TimeoutOracleRejectionError };
