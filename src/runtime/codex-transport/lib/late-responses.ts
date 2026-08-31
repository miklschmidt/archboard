import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import { decodeJsonRpcError, decodeResponseEnvelope } from "../../codex-protocol/index.js";
import type { RequestTombstone } from "./internals.js";
import type { TransportIssue, TransportLateResponse } from "./types.js";
import { cloneAndFreeze, jsonByteLength } from "./public-values.js";

function redactError(error: {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}) {
	const maximum = CODEX_APP_SERVER_CAPACITY.text.maxChars;
	const suffix = "...";
	return Object.freeze({
		code: error.code,
		message:
			error.message.length > maximum
				? `${error.message.slice(0, maximum - suffix.length)}${suffix}`
				: error.message,
		dataPresent: Object.prototype.hasOwnProperty.call(error, "data"),
	});
}

export interface LateResponseStore {
	readonly values: TransportLateResponse[];
	readonly retain: (tombstone: RequestTombstone, value: Record<string, unknown>) => void;
}

export function createLateResponseStore(
	emitIssue: (issue: TransportIssue) => void,
): LateResponseStore {
	const values: TransportLateResponse[] = [];

	const retain = (tombstone: RequestTombstone, value: Record<string, unknown>): void => {
		const common = {
			outcome: tombstone.settlement === "delivered" ? "duplicate" : "outcome_unknown",
			method: tombstone.method,
			correlation: tombstone.correlation,
			requestId: tombstone.wireId,
			settlement: tombstone.settlement,
			retryEligible: tombstone.retryEligible,
			...(tombstone.reason === undefined ? {} : { reason: tombstone.reason }),
		} as const;
		let late: TransportLateResponse;
		const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
		const hasError = Object.prototype.hasOwnProperty.call(value, "error");
		if (hasResult && !hasError) {
			try {
				const result = cloneAndFreeze(decodeResponseEnvelope(tombstone.method, value).result);
				const resultBytes = jsonByteLength(result);
				late =
					resultBytes > CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes
						? ({
								...common,
								kind: "redacted",
								payload: { reason: "retained-size", byteLength: resultBytes },
							} as TransportLateResponse)
						: ({ ...common, kind: "result", payload: result } as TransportLateResponse);
			} catch {
				late = {
					...common,
					kind: "malformed",
					payload: { reason: "response-schema" },
				} as TransportLateResponse;
			}
		} else if (hasError && !hasResult) {
			try {
				const error = decodeJsonRpcError(value, tombstone.method).error;
				late = { ...common, kind: "error", payload: redactError(error) } as TransportLateResponse;
			} catch {
				late = {
					...common,
					kind: "malformed",
					payload: { reason: "response-schema" },
				} as TransportLateResponse;
			}
		} else
			late = {
				...common,
				kind: "malformed",
				payload: { reason: "response-schema" },
			} as TransportLateResponse;

		const frozen = cloneAndFreeze(late);
		const recordBytes = jsonByteLength(frozen);
		if (recordBytes > CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes) {
			late = {
				outcome: common.outcome,
				method: common.method,
				settlement: common.settlement,
				retryEligible: common.retryEligible,
				...(common.reason === undefined ? {} : { reason: common.reason }),
				kind: "redacted",
				payload: { reason: "retained-size", byteLength: recordBytes },
			} as TransportLateResponse;
		}
		if (values.length >= CODEX_APP_SERVER_CAPACITY.retention.lateResponses) values.shift();
		values.push(cloneAndFreeze(late));
		emitIssue({
			kind: "duplicate-response",
			direction: "response",
			method: tombstone.method,
			requestId: tombstone.wireId,
			detail: "A response arrived after its request had already settled",
		});
	};

	return Object.freeze({ values, retain });
}
