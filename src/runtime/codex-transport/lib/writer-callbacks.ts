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

function isSettledJob(
	job: WriteJob,
): job is Extract<WriteJob, { readonly kind: "notification" | "reverse-response" }> {
	return job.kind === "notification" || job.kind === "reverse-response";
}

function createTransportWriterCallbacks(
	options: TransportWriterCallbacksOptions,
): FrameWriterCallbacks<WriteJob> {
	const onAccepted = (queued: FrameWriterJob<WriteJob>): void => {
		if (queued.value.kind === "request") {
			queued.value.pending.accepted = true;
		} else if (queued.value.kind === "reverse-response") {
			options.acceptReverseResponse(queued.value.record);
		}
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
			...(job.kind === "request" ? { method: job.pending.method } : {}),
			detail: "Codex stdin rejected a frame",
		});
		if (job.kind === "request") {
			job.pending.accepted = writeReturned;
			job.pending.job = undefined;
			options.settleFailure(job.pending, "write-error");
		} else if (job.kind === "reverse-response") {
			options.releaseReverseResponse(job.record);
			if (!job.settled) {
				job.settled = true;
				job.reject(new CodexTransportWriteError("write-error", "Codex stdin rejected a frame"));
			}
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
			let failureReason: CodexRequestFailureReason = "shutdown";
			if (
				reason instanceof CodexTransportWriteError ||
				reason instanceof CodexTransportClosedError
			) {
				failureReason = reason.reason;
			}
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

export { createTransportWriterCallbacks };
export type { TransportWriterCallbacksOptions };
