import { CodexServerResponseSchema } from "@/runtime/codex-protocol";
import type { ServerRequestMethod } from "@/runtime/codex-protocol";
import {
	CodexTransportOwnershipError,
	CodexTransportUsageError,
} from "@/runtime/codex-transport/lib/errors";
import type {
	ReverseRecord,
	ReverseResponseJob,
	WriteJob,
} from "@/runtime/codex-transport/lib/internals";
import type {
	ResponseOwner,
	ReverseResponse,
	TransportServerRequest,
} from "@/runtime/codex-transport/lib/types";
import { hasOwn, isRecord, jsonLine } from "@/runtime/codex-transport/lib/wire";
import { cloneAndFreeze } from "@/runtime/codex-transport/lib/public-values";
import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";

interface ReverseResponderOptions {
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly removePendingBytes: (bytes: number) => void;
	readonly retainCompletedReverseId: (key: string) => void;
	readonly enqueue: (job: WriteJob, lane: "response") => void;
}

interface ReverseResponder {
	readonly respond: (
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	) => Promise<void>;
}

/**
 * Whether a reverse record can still be answered: known, current, and not yet responding.
 * @param record The record found for the request handle, if any.
 * @param reverseRequests The live reverse-request table.
 * @returns True when a response may be queued for it.
 */
function isAnswerable(
	record: ReverseRecord | undefined,
	reverseRequests: Map<string, ReverseRecord>,
): record is ReverseRecord {
	return (
		record !== undefined &&
		!record.responded &&
		!record.responding &&
		reverseRequests.get(record.key) === record
	);
}

/**
 * Requires the response to carry exactly one of result and error and nothing else.
 * @param response The caller's response object.
 * @returns Which outcome it carries.
 */
function outcomeOf(response: Record<string, unknown>): "result" | "error" {
	const hasResult = hasOwn(response, "result");
	const hasError = hasOwn(response, "error");
	const onlyOutcomeKeys = Reflect.ownKeys(response).every(
		(key) => key === "result" || key === "error",
	);
	if (hasResult === hasError || !onlyOutcomeKeys) {
		throw new CodexTransportUsageError("reverse response must contain exactly one result or error");
	}
	return hasResult ? "result" : "error";
}

/**
 * Validates a reverse response against the authored schema for the request's method and
 * returns a frozen copy, so listeners cannot alter what is written.
 * @param method The reverse request's method.
 * @param response The caller's response.
 * @returns The canonical response record.
 */
function canonicalResponse(
	method: ServerRequestMethod,
	response: ReverseResponse,
): Record<string, unknown> {
	if (!isRecord(response)) {
		throw new CodexTransportUsageError("reverse response must be an object");
	}
	try {
		const candidate =
			outcomeOf(response) === "result"
				? { method, result: response.result }
				: { method, error: response.error };
		const parsed = CodexServerResponseSchema.safeParse(candidate);
		if (!parsed.success) {
			throw new CodexTransportUsageError(
				`reverse response does not match the authored ${method} result schema`,
			);
		}
		return cloneAndFreeze(parsed.data);
	} catch (error) {
		if (error instanceof CodexTransportUsageError) {
			throw error;
		}
		throw new CodexTransportUsageError("reverse response is not JSON-shaped");
	}
}

/**
 * Encodes the response frame within the reverse-response byte bound.
 * @param record The reverse request being answered.
 * @param canonical The validated response.
 * @returns The frame bytes.
 */
function responseFrame(record: ReverseRecord, canonical: Record<string, unknown>): Buffer {
	return jsonLine(
		{
			id: record.wireId,
			...(hasOwn(canonical, "result")
				? { result: canonical["result"] }
				: { error: canonical["error"] }),
		},
		"reverse response",
		CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes,
	);
}

/**
 * Creates the reverse-request answering path: ownership checks, schema validation, and the
 * response-lane write whose completion marks the request answered.
 * @param options The transport's reverse-request tables and response-lane queue.
 * @returns The responder.
 */
function createReverseResponder(options: ReverseResponderOptions): ReverseResponder {
	/**
	 * Queues the response frame and ties the caller's promise to its write.
	 * @param record The reverse request being answered.
	 * @param frame The response frame.
	 * @param resolve Settles the caller's promise when the frame is written.
	 * @param reject Settles the caller's promise when the write fails or cannot be queued.
	 */
	const queueResponse = (
		record: ReverseRecord,
		frame: Buffer,
		resolve: () => void,
		reject: (reason: unknown) => void,
	): void => {
		const job: ReverseResponseJob = {
			kind: "reverse-response",
			frame,
			record,
			resolve,
			reject,
			settled: false,
		};
		record.responding = true;
		try {
			options.enqueue(job, "response");
		} catch (error) {
			record.responding = false;
			job.settled = true;
			reject(error);
		}
	};

	/**
	 * Answers a reverse request on behalf of its owner.
	 * @param request The request handle the transport published.
	 * @param owner Who is answering; must be the request's owner.
	 * @param response The result or error to send.
	 * @returns A promise settled once the response frame is written.
	 */
	const respond = (
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	): Promise<void> => {
		const record = options.reverseHandles.get(request);
		if (!isAnswerable(record, options.reverseRequests)) {
			return Promise.reject(
				new CodexTransportOwnershipError("the reverse request is unknown or already answered"),
			);
		}
		if (owner !== record.request.owner) {
			return Promise.reject(
				new CodexTransportOwnershipError(
					`owner ${JSON.stringify(owner)} cannot answer a request owned by ${record.request.owner}`,
				),
			);
		}
		let frame: Buffer;
		try {
			frame = responseFrame(record, canonicalResponse(record.request.method, response));
		} catch (error) {
			return Promise.reject(error);
		}
		return new Promise<void>((resolve, reject) => {
			queueResponse(record, frame, resolve, reject);
		});
	};

	return Object.freeze({ respond });
}

export { type ReverseResponderOptions, type ReverseResponder, createReverseResponder };
