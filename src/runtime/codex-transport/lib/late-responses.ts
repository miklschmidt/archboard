import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import { decodeJsonRpcError, decodeResponseEnvelope } from "@/runtime/codex-protocol";
import type { ResponseMethod } from "@/runtime/codex-protocol";
import { redactRemoteError } from "@/runtime/codex-transport/lib/errors";
import type { RequestTombstone } from "@/runtime/codex-transport/lib/internals";
import type {
	TransportIssue,
	TransportLateResponse,
	TransportLateResponseFor,
} from "@/runtime/codex-transport/lib/types";
import { cloneAndFreeze, jsonByteLength } from "@/runtime/codex-transport/lib/public-values";
import { responseKind } from "@/runtime/codex-transport/lib/wire";

type RetainedTombstone = Readonly<
	Omit<RequestTombstone, "correlation"> & {
		readonly correlation: Readonly<RequestTombstone["correlation"]>;
	}
>;

/** A late response built for the tombstone's own method, before the mapped union is restored. */
type LateRecord = TransportLateResponseFor<ResponseMethod>;

/** The fields every late record shares, copied from the settled request's tombstone. */
type LateContext = Pick<
	Extract<LateRecord, { readonly kind: "result" }>,
	"outcome" | "method" | "correlation" | "requestId" | "settlement" | "retryEligible" | "reason"
>;

const MALFORMED = Object.freeze({
	kind: "malformed",
	payload: Object.freeze({ reason: "response-schema" }),
} as const);

/**
 * The context a late record inherits from its tombstone.
 * @param tombstone The settled request's tombstone.
 * @returns The shared fields; reason is present only when the tombstone recorded one.
 */
function lateContext(tombstone: RetainedTombstone): LateContext {
	return {
		outcome: tombstone.settlement === "delivered" ? "duplicate" : "outcome_unknown",
		method: tombstone.method,
		correlation: tombstone.correlation,
		requestId: tombstone.wireId,
		settlement: tombstone.settlement,
		retryEligible: tombstone.retryEligible,
		...(tombstone.reason === undefined ? {} : { reason: tombstone.reason }),
	};
}

/**
 * Builds the record for a late result, redacting a result larger than the record bound.
 * @param context The shared fields.
 * @param value The response frame.
 * @returns The result, redacted, or malformed record.
 */
function resultRecord(context: LateContext, value: Readonly<Record<string, unknown>>): LateRecord {
	try {
		const result = cloneAndFreeze(decodeResponseEnvelope(context.method, value).result);
		const resultBytes = jsonByteLength(result);
		return resultBytes > CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes
			? {
					...context,
					kind: "redacted",
					payload: { reason: "retained-size", byteLength: resultBytes },
				}
			: { ...context, kind: "result", payload: result };
	} catch {
		return { ...context, ...MALFORMED };
	}
}

/**
 * Builds the record for a late JSON-RPC error.
 * @param context The shared fields.
 * @param value The response frame.
 * @returns The error record, or a malformed record when the error does not decode.
 */
function errorRecord(context: LateContext, value: Readonly<Record<string, unknown>>): LateRecord {
	try {
		const { error } = decodeJsonRpcError(value, context.method);
		return { ...context, kind: "error", payload: redactRemoteError(error) };
	} catch {
		return { ...context, ...MALFORMED };
	}
}

/**
 * Builds the late record a response frame deserves.
 * @param context The shared fields.
 * @param value The response frame.
 * @returns The record classified by what the frame carried.
 */
function lateRecord(context: LateContext, value: Readonly<Record<string, unknown>>): LateRecord {
	switch (responseKind(value)) {
		case "result":
			return resultRecord(context, value);
		case "error":
			return errorRecord(context, value);
		default:
			return { ...context, ...MALFORMED };
	}
}

/**
 * Redacts a whole record, correlation included, when even the record exceeds the bound.
 * @param late The candidate record.
 * @param context The shared fields.
 * @returns The record, or a correlation-free redaction naming its size.
 */
function boundedRecord(late: LateRecord, context: LateContext): LateRecord {
	const recordBytes = jsonByteLength(cloneAndFreeze(late));
	if (recordBytes <= CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes) {
		return late;
	}
	return {
		outcome: context.outcome,
		method: context.method,
		settlement: context.settlement,
		retryEligible: context.retryEligible,
		...(context.reason === undefined ? {} : { reason: context.reason }),
		kind: "redacted",
		payload: { reason: "retained-size", byteLength: recordBytes },
	};
}

interface LateResponseStore {
	readonly values: readonly TransportLateResponse[];
	readonly retain: (tombstone: RetainedTombstone, value: Readonly<Record<string, unknown>>) => void;
}

/**
 * Creates the bounded log of responses that arrived after their request had settled, which
 * is the evidence a retry decision needs.
 * @param emitIssue Raises the duplicate-response issue for each retained record.
 * @returns The store.
 */
function createLateResponseStore(
	emitIssue: (issue: Readonly<TransportIssue>) => void,
): LateResponseStore {
	const values: TransportLateResponse[] = [];

	/**
	 * Retains a late response against its tombstone and raises the issue.
	 * @param tombstone The settled request's tombstone.
	 * @param value The response frame.
	 */
	const retain = (tombstone: RetainedTombstone, value: Readonly<Record<string, unknown>>): void => {
		const context = lateContext(tombstone);
		const late = boundedRecord(lateRecord(context, value), context);
		if (values.length >= CODEX_APP_SERVER_CAPACITY.retention.lateResponses) {
			values.shift();
		}
		// The record was decoded with the tombstone's own method, so its payload matches that
		// method; TypeScript cannot fold the widened member back into the method-indexed union.
		// oxlint-disable-next-line typescript(no-unsafe-type-assertion) -- payload decoded for its own method
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
