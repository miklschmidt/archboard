import {
	CodexTransportClosedError,
	CodexTransportWriteError,
} from "@/runtime/codex-transport/lib/errors";
import type { CodexRequestFailureReason } from "@/runtime/codex-transport/lib/errors";
import type {
	FrameWriterCallbacks,
	FrameWriterJob,
} from "@/runtime/codex-transport/lib/frame-writer";
import type {
	PendingRequest,
	ReverseRecord,
	WriteJob,
} from "@/runtime/codex-transport/lib/internals";
import type { TransportIssue } from "@/runtime/codex-transport/lib/types";

interface TransportWriterCallbacksOptions {
	readonly emitIssue: (issue: TransportIssue) => void;
	readonly settleFailure: (pending: PendingRequest, reason: CodexRequestFailureReason) => void;
	readonly acceptReverseResponse: (record: ReverseRecord) => void;
	readonly releaseReverseResponse: (record: ReverseRecord) => void;
	readonly closeTransport: (
		reason: Extract<
			CodexRequestFailureReason,
			"child-exit" | "stdout-error" | "write-error" | "shutdown" | "frame-too-large"
		>,
	) => void;
	readonly finishShutdown: () => void;
}

type SettledJob = Extract<WriteJob, { readonly kind: "notification" | "reverse-response" }>;

/**
 * Whether a job carries its own promise settlement (notifications and reverse responses do;
 * requests settle through their pending record and protocol errors are fire-and-forget).
 * @param job The write job.
 * @returns True for jobs with resolve and reject callbacks.
 */
function isSettledJob(job: WriteJob): job is SettledJob {
	return job.kind === "notification" || job.kind === "reverse-response";
}

/**
 * Rejects a self-settling job's promise once; later settlements are ignored.
 * @param job The job to reject.
 * @param reason What to reject with.
 */
function rejectOnce(job: SettledJob, reason: unknown): void {
	if (job.settled) {
		return;
	}
	job.settled = true;
	job.reject(reason);
}

/**
 * The failure reason a dropped request is charged to: the drop cause's own reason when the
 * writer closed or failed, otherwise shutdown.
 * @param reason What the writer dropped the job with.
 * @returns The request failure reason.
 */
function droppedRequestReason(reason: unknown): CodexRequestFailureReason {
	if (reason instanceof CodexTransportWriteError || reason instanceof CodexTransportClosedError) {
		return reason.reason;
	}
	return "shutdown";
}

/**
 * Binds the frame writer's lifecycle events to request settlement, reverse-request
 * bookkeeping, and shutdown progress.
 * @param options The transport hooks the callbacks drive.
 * @returns The callbacks to hand the frame writer.
 */
function createTransportWriterCallbacks(
	options: TransportWriterCallbacksOptions,
): FrameWriterCallbacks<WriteJob> {
	/**
	 * Marks a job as handed to stdin, after which its outcome is unknown rather than undelivered.
	 * @param queued The job the writer accepted.
	 */
	const onAccepted = (queued: FrameWriterJob<WriteJob>): void => {
		if (queued.value.kind === "request") {
			queued.value.pending.accepted = true;
		} else if (queued.value.kind === "reverse-response") {
			options.acceptReverseResponse(queued.value.record);
		}
	};

	/**
	 * Settles a fully written job and lets a pending shutdown advance.
	 * @param queued The job the writer completed.
	 */
	const onComplete = (queued: FrameWriterJob<WriteJob>): void => {
		const job = queued.value;
		if (job.kind === "request") {
			job.pending.accepted = true;
			job.pending.job = undefined;
		} else if (isSettledJob(job) && !job.settled) {
			job.settled = true;
			job.resolve();
		}
		options.finishShutdown();
	};

	/**
	 * Fails the job whose write faulted and closes the transport, since stdin is now unusable.
	 * @param queued The job that faulted.
	 * @param _error The stream error, already summarised as an issue.
	 * @param writeReturned Whether stdin.write returned before failing, which makes the outcome unknown.
	 */
	const onError = (
		queued: FrameWriterJob<WriteJob>,
		_error: Error,
		writeReturned: boolean,
	): void => {
		const job = queued.value;
		options.emitIssue({
			kind: "write-error",
			direction: "write",
			...(job.kind === "request" ? { method: job.pending.method } : {}),
			detail: "Codex stdin rejected a frame",
		});
		if (job.kind === "request") {
			job.pending.accepted = writeReturned;
			job.pending.job = undefined;
			options.settleFailure(job.pending, "write-error");
		} else if (isSettledJob(job)) {
			if (job.kind === "reverse-response") {
				options.releaseReverseResponse(job.record);
			}
			rejectOnce(job, new CodexTransportWriteError("write-error", "Codex stdin rejected a frame"));
		}
		options.closeTransport("write-error");
	};

	/**
	 * Settles a job the writer discarded without writing it.
	 * @param queued The dropped job.
	 * @param reason Why the writer dropped it.
	 */
	const onDrop = (queued: FrameWriterJob<WriteJob>, reason: unknown): void => {
		const job = queued.value;
		if (job.kind === "request") {
			job.pending.job = undefined;
			options.settleFailure(job.pending, droppedRequestReason(reason));
		} else if (isSettledJob(job)) {
			if (job.kind === "reverse-response") {
				options.releaseReverseResponse(job.record);
			}
			rejectOnce(job, reason);
		}
	};

	return {
		onAccepted,
		onComplete,
		onError,
		onDrop,
		onIdle: options.finishShutdown,
	};
}

export { createTransportWriterCallbacks };
export type { TransportWriterCallbacksOptions };
