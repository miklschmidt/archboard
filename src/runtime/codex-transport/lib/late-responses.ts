import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import { decodeJsonRpcError, decodeResponseEnvelope } from "../../codex-protocol/index.js";
import type { RequestTombstone } from "./internals.js";
import type { TransportIssue, TransportLateResponse, TransportLateResponseFor } from "./types.js";
import type { ResponseMethod } from "../../codex-protocol/index.js";
import { cloneAndFreeze, jsonByteLength } from "./public-values.js";

type RetainedTombstone = Readonly<
	Omit<RequestTombstone, "correlation"> & {
		readonly correlation: Readonly<RequestTombstone["correlation"]>;
	}
>;

function redactError(error: {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}): Readonly<{ code: number; message: string; dataPresent: boolean }> {
	const maximum = CODEX_APP_SERVER_CAPACITY.text.maxChars;
	const suffix = "...";
	return Object.freeze({
		code: error.code,
		message:
			error.message.length > maximum
				? `${error.message.slice(0, maximum - suffix.length)}${suffix}`
				: error.message,
		dataPresent: Object.hasOwn(error, "data"),
	});
}

interface LateResponseStore {
	readonly values: readonly TransportLateResponse[];
	readonly retain: <Method extends ResponseMethod>(
		tombstone: RetainedTombstone & { readonly method: Method },
		value: Readonly<Record<string, unknown>>,
	) => void;
}

function createLateResponseStore(
	emitIssue: (issue: Readonly<TransportIssue>) => void,
): LateResponseStore {
	const values: TransportLateResponse[] = [];

	const retain = <Method extends ResponseMethod>(
		tombstone: RetainedTombstone & { readonly method: Method },
		value: Readonly<Record<string, unknown>>,
	): void => {
		const common = {
			outcome: tombstone.settlement === "delivered" ? "duplicate" : "outcome_unknown",
			method: tombstone.method,
			correlation: tombstone.correlation,
			requestId: tombstone.wireId,
			settlement: tombstone.settlement,
			retryEligible: tombstone.retryEligible,
			...(tombstone.reason === undefined ? {} : { reason: tombstone.reason }),
		} as const;
		let late: TransportLateResponseFor<Method>;
		const hasResult = Object.hasOwn(value, "result");
		const hasError = Object.hasOwn(value, "error");
		if (hasResult && !hasError) {
			try {
				const result = cloneAndFreeze(decodeResponseEnvelope(tombstone.method, value).result);
				const resultBytes = jsonByteLength(result);
				late =
					resultBytes > CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes
						? {
								...common,
								kind: "redacted",
								payload: { reason: "retained-size", byteLength: resultBytes },
							}
						: { ...common, kind: "result", payload: result };
			} catch {
				late = {
					...common,
					kind: "malformed",
					payload: { reason: "response-schema" },
				};
			}
		} else if (hasError && !hasResult) {
			try {
				const { error } = decodeJsonRpcError(value, tombstone.method);
				late = { ...common, kind: "error", payload: redactError(error) };
			} catch {
				late = {
					...common,
					kind: "malformed",
					payload: { reason: "response-schema" },
				};
			}
		} else {
			late = {
				...common,
				kind: "malformed",
				payload: { reason: "response-schema" },
			};
		}

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
			};
		}
		if (values.length >= CODEX_APP_SERVER_CAPACITY.retention.lateResponses) {
			values.shift();
		}
		// `late` is already checked as the exact method-indexed member; TypeScript cannot
		// collapse that generic member back into the equivalent mapped union.
		values.push(cloneAndFreeze(late) as TransportLateResponse);
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

export { createLateResponseStore };
export type { LateResponseStore };
