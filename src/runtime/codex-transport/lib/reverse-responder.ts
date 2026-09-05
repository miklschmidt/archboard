import { CodexServerResponseSchema } from "../../codex-protocol/index.js";
import { CodexTransportOwnershipError, CodexTransportUsageError } from "./errors.js";
import type { ReverseRecord, ReverseResponseJob, WriteJob } from "./internals.js";
import type { ResponseOwner, ReverseResponse, TransportServerRequest } from "./types.js";
import { hasOwn, isRecord, jsonLine } from "./wire.js";
import { cloneAndFreeze } from "./public-values.js";
import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";

export interface ReverseResponderOptions {
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly removePendingBytes: (bytes: number) => void;
	readonly retainCompletedReverseId: (key: string) => void;
	readonly enqueue: (job: WriteJob, lane: "response") => void;
}

export interface ReverseResponder {
	readonly respond: (
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	) => Promise<void>;
}

export function createReverseResponder(options: ReverseResponderOptions): ReverseResponder {
	const respond = (
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	): Promise<void> => {
		const record = options.reverseHandles.get(request);
		if (
			!record ||
			record.responded ||
			record.responding ||
			options.reverseRequests.get(record.key) !== record
		) {
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
		if (!isRecord(response)) {
			return Promise.reject(new CodexTransportUsageError("reverse response must be an object"));
		}
		let hasResult: boolean;
		let canonical: Record<string, unknown>;
		try {
			hasResult = hasOwn(response, "result");
			const hasError = hasOwn(response, "error");
			if (
				hasResult === hasError ||
				Reflect.ownKeys(response).some(
					(key) => typeof key !== "string" || (key !== "result" && key !== "error"),
				)
			) {
				return Promise.reject(
					new CodexTransportUsageError("reverse response must contain exactly one result or error"),
				);
			}
			const candidate = hasResult
				? { method: record.request.method, result: response.result }
				: { method: record.request.method, error: response.error };
			const parsed = CodexServerResponseSchema.safeParse(candidate);
			if (!parsed.success) {
				return Promise.reject(
					new CodexTransportUsageError(
						`reverse response does not match the authored ${record.request.method} result schema`,
					),
				);
			}
			canonical = cloneAndFreeze(parsed.data) as Record<string, unknown>;
		} catch {
			return Promise.reject(new CodexTransportUsageError("reverse response is not JSON-shaped"));
		}
		let frame: Buffer;
		try {
			frame = jsonLine(
				{
					id: record.wireId,
					...(hasOwn(canonical, "result")
						? { result: canonical["result"] }
						: { error: canonical["error"] }),
				},
				"reverse response",
				CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes,
			);
		} catch (error) {
			return Promise.reject(error);
		}

		return new Promise<void>((resolve, reject) => {
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
				return;
			}
		});
	};

	return Object.freeze({ respond });
}
