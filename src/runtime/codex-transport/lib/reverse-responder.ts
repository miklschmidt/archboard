import {
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "../../../shared/codex-browser-model/index.js";
import type { ResponseOwner } from "./types.js";
import type { ReverseResponse, TransportServerRequest } from "./types.js";
import { CodexTransportOwnershipError, CodexTransportUsageError } from "./errors.js";
import type { ReverseRecord, ReverseResponseJob, WriteJob } from "./internals.js";
import { hasOwn, isRecord, jsonLine } from "./wire.js";

export interface ReverseResponderOptions {
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly retainCompletedReverseId: (key: string) => void;
	readonly enqueue: (job: WriteJob) => void;
}

export interface ReverseResponder {
	readonly respond: {
		(request: TransportServerRequest, response: ReverseResponse): Promise<void>;
		(
			request: TransportServerRequest,
			owner: ResponseOwner,
			response: ReverseResponse,
		): Promise<void>;
	};
}

export function createReverseResponder(options: ReverseResponderOptions): ReverseResponder {
	function respond(request: TransportServerRequest, response: ReverseResponse): Promise<void>;
	function respond(
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	): Promise<void>;
	function respond(
		request: TransportServerRequest,
		ownerOrResponse: ResponseOwner | ReverseResponse,
		maybeResponse?: ReverseResponse,
	): Promise<void> {
		const owner = maybeResponse === undefined ? undefined : (ownerOrResponse as ResponseOwner);
		const response = maybeResponse === undefined ? ownerOrResponse : maybeResponse;
		const record = options.reverseHandles.get(request);
		if (!record || record.responded || options.reverseRequests.get(record.key) !== record)
			return Promise.reject(
				new CodexTransportOwnershipError("the reverse request is unknown or already answered"),
			);
		if (owner !== undefined && owner !== record.request.owner)
			return Promise.reject(
				new CodexTransportOwnershipError(
					`owner ${JSON.stringify(owner)} cannot answer a request owned by ${record.request.owner}`,
				),
			);
		if (!isRecord(response))
			return Promise.reject(new CodexTransportUsageError("reverse response must be an object"));
		const hasResult = hasOwn(response, "result");
		const hasError = hasOwn(response, "error");
		if (hasResult === hasError)
			return Promise.reject(
				new CodexTransportUsageError("reverse response must contain exactly one result or error"),
			);
		if (hasError) {
			if (
				!isRecord(response.error) ||
				typeof response.error.code !== "number" ||
				!Number.isInteger(response.error.code)
			)
				return Promise.reject(
					new CodexTransportUsageError("reverse error must contain an integer code"),
				);
			if (typeof response.error.message !== "string")
				return Promise.reject(
					new CodexTransportUsageError("reverse error must contain a string message"),
				);
			for (const key of Object.keys(response.error))
				if (key !== "code" && key !== "message" && key !== "data")
					return Promise.reject(
						new CodexTransportUsageError(`reverse error contains unknown field ${key}`),
					);
		}
		if (record.request.owner === "codex-session") {
			if (record.request.method === "currentTime/read") {
				if (
					!hasResult ||
					!isRecord(response.result) ||
					Object.keys(response.result).length !== 1 ||
					!hasOwn(response.result, "currentTimeAt") ||
					typeof response.result.currentTimeAt !== "number" ||
					!Number.isSafeInteger(response.result.currentTimeAt) ||
					response.result.currentTimeAt < 0
				)
					return Promise.reject(
						new CodexTransportUsageError("currentTime/read must return { currentTimeAt }"),
					);
			} else {
				const expected =
					record.request.method === "attestation/generate"
						? UNSUPPORTED_ATTESTATION_ERROR
						: UNSUPPORTED_TOKEN_REFRESH_ERROR;
				if (
					!hasError ||
					!isRecord(response.error) ||
					response.error.code !== expected.code ||
					response.error.message !== expected.message ||
					hasOwn(response.error, "data")
				)
					return Promise.reject(
						new CodexTransportUsageError(
							`unsupported ${record.request.method} must return its authored -32601 error`,
						),
					);
			}
		}
		let frame: Buffer;
		try {
			frame = jsonLine(
				{
					id: record.wireId,
					...(hasResult ? { result: response.result } : { error: response.error }),
				},
				"reverse response",
			);
		} catch (error) {
			return Promise.reject(error);
		}
		record.responded = true;
		options.reverseRequests.delete(record.key);
		options.reverseHandles.delete(request);
		options.retainCompletedReverseId(record.key);
		return new Promise<void>((resolve, reject) => {
			const job: ReverseResponseJob = {
				kind: "reverse-response",
				frame,
				record,
				resolve,
				reject,
				settled: false,
			};
			try {
				options.enqueue(job);
			} catch (error) {
				job.settled = true;
				reject(error);
			}
		});
	}

	return Object.freeze({ respond });
}
