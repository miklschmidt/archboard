import {
	CodexTransportClosedError,
	CodexTransportWriteError,
	type CodexRequestFailureReason,
} from "./errors.js";
import type { FrameWriterCallbacks, FrameWriterJob } from "./frame-writer.js";
import type { PendingRequest, ReverseRecord, WriteJob } from "./internals.js";
import type { TransportIssue } from "./types.js";

export interface TransportWriterCallbacksOptions {
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

function isSettledJob(
	job: WriteJob,
): job is Extract<WriteJob, { readonly kind: "notification" | "reverse-response" }> {
	return job.kind === "notification" || job.kind === "reverse-response";
}

export function createTransportWriterCallbacks(
	options: TransportWriterCallbacksOptions,
): FrameWriterCallbacks<WriteJob> {
	const onAccepted = (queued: FrameWriterJob<WriteJob>): void => {
		if (queued.value.kind === "request") queued.value.pending.accepted = true;
		else if (queued.value.kind === "reverse-response")
			options.acceptReverseResponse(queued.value.record);
	};

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

	const onError = (
		queued: FrameWriterJob<WriteJob>,
		_error: Error,
		writeReturned: boolean,
	): void => {
		const job = queued.value;
		options.emitIssue({
			kind: "write-error",
			direction: "write",
			method: job.kind === "request" ? job.pending.method : undefined,
			detail: "Codex stdin rejected a frame",
		});
		if (job.kind === "request") {
			job.pending.accepted = writeReturned;
			job.pending.job = undefined;
			options.settleFailure(job.pending, "write-error");
		} else if (job.kind === "reverse-response") {
			options.releaseReverseResponse(job.record);
		} else if (isSettledJob(job) && !job.settled) {
			job.settled = true;
			job.reject(new CodexTransportWriteError("write-error", "Codex stdin rejected a frame"));
		}
		options.closeTransport("write-error");
	};

	const onDrop = (queued: FrameWriterJob<WriteJob>, reason: unknown): void => {
		const job = queued.value;
		if (job.kind === "request") {
			job.pending.job = undefined;
			const failureReason =
				reason instanceof CodexTransportWriteError
					? reason.reason
					: reason instanceof CodexTransportClosedError
						? reason.reason
						: "shutdown";
			options.settleFailure(job.pending, failureReason);
		} else if (job.kind === "reverse-response") {
			options.releaseReverseResponse(job.record);
			if (!job.settled) {
				job.settled = true;
				job.reject(reason);
			}
		} else if (isSettledJob(job) && !job.settled) {
			job.settled = true;
			job.reject(reason);
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
