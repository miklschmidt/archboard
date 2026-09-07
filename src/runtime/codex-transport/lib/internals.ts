import type { ResponseMethod } from "@/runtime/codex-protocol";
import type { TransportServerRequest } from "@/runtime/codex-transport/lib/types";
import type { FrameWriterJob } from "@/runtime/codex-transport/lib/frame-writer";
import type { JsonRpcRequestId, WireRequestCorrelation } from "@/shared/codex-workbench-identity";
import type { CodexRequestFailureReason } from "@/runtime/codex-transport/lib/errors";

interface PendingRequest {
	readonly key: string;
	readonly wireId: JsonRpcRequestId;
	readonly method: ResponseMethod;
	readonly correlation: WireRequestCorrelation;
	readonly retryEligible: boolean;
	readonly resolve: (value: unknown) => void;
	readonly reject: (reason: unknown) => void;
	readonly signal: AbortSignal | undefined;
	abortListener?: () => void;
	timer?: ReturnType<typeof setTimeout>;
	job: FrameWriterJob<WriteJob> | undefined;
	accepted: boolean;
	settled: boolean;
}

interface RequestTombstone {
	readonly key: string;
	readonly wireId: JsonRpcRequestId;
	readonly method: ResponseMethod;
	readonly correlation: WireRequestCorrelation;
	readonly retryEligible: boolean;
	accepted: boolean;
	settlement: "delivered" | "not_delivered" | "outcome_unknown";
	reason?: CodexRequestFailureReason;
}

interface ReverseRecord {
	readonly key: string;
	readonly wireId: string | number;
	readonly request: TransportServerRequest;
	readonly bytes: number;
	responded: boolean;
	responding: boolean;
}

interface RequestJob {
	readonly kind: "request";
	readonly frame: Buffer;
	readonly pending: PendingRequest;
}

interface NotificationJob {
	readonly kind: "notification";
	readonly frame: Buffer;
	readonly resolve: () => void;
	readonly reject: (reason: unknown) => void;
	settled: boolean;
}

interface ReverseResponseJob {
	readonly kind: "reverse-response";
	readonly frame: Buffer;
	readonly record: ReverseRecord;
	readonly resolve: () => void;
	readonly reject: (reason: unknown) => void;
	settled: boolean;
}

interface ProtocolErrorJob {
	readonly kind: "protocol-error";
	readonly frame: Buffer;
	readonly key: string;
}

type WriteJob = RequestJob | NotificationJob | ReverseResponseJob | ProtocolErrorJob;

export type {
	NotificationJob,
	PendingRequest,
	ProtocolErrorJob,
	RequestJob,
	RequestTombstone,
	ReverseRecord,
	ReverseResponseJob,
	WriteJob,
};
