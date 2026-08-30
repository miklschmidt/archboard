import type { ResponseMethod } from "../../codex-protocol/index.js";
import type { TransportServerRequest } from "./types.js";
import type { FrameWriterJob } from "./frame-writer.js";
import type {
	JsonRpcRequestId,
	WireRequestCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import type { CodexRequestFailureReason } from "./errors.js";

export interface PendingRequest {
	readonly key: string;
	readonly wireId: JsonRpcRequestId;
	readonly method: ResponseMethod;
	readonly correlation: WireRequestCorrelation;
	readonly idempotent: boolean;
	readonly resolve: (value: unknown) => void;
	readonly reject: (reason: unknown) => void;
	readonly signal?: AbortSignal;
	abortListener?: () => void;
	timer?: ReturnType<typeof setTimeout>;
	job?: FrameWriterJob<WriteJob>;
	accepted: boolean;
	settled: boolean;
}

export interface RequestTombstone {
	readonly key: string;
	readonly wireId: JsonRpcRequestId;
	readonly method: ResponseMethod;
	readonly correlation: WireRequestCorrelation;
	readonly idempotent: boolean;
	accepted: boolean;
	settlement: "delivered" | "not_delivered" | "outcome_unknown";
	reason?: CodexRequestFailureReason;
}

export interface ReverseRecord {
	readonly key: string;
	readonly wireId: string | number;
	readonly request: TransportServerRequest;
	responded: boolean;
}

export interface RequestJob {
	readonly kind: "request";
	readonly frame: Buffer;
	readonly pending: PendingRequest;
}

export interface NotificationJob {
	readonly kind: "notification";
	readonly frame: Buffer;
	readonly resolve: () => void;
	readonly reject: (reason: unknown) => void;
	settled: boolean;
}

export interface ReverseResponseJob {
	readonly kind: "reverse-response";
	readonly frame: Buffer;
	readonly record: ReverseRecord;
	readonly resolve: () => void;
	readonly reject: (reason: unknown) => void;
	settled: boolean;
}

export type WriteJob = RequestJob | NotificationJob | ReverseResponseJob;
