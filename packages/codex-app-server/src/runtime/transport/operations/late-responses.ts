import { CODEX_APP_SERVER_CAPACITY } from "#shared/constants/app-server-capacity.ts";
import { decodeFrameBody, type ResponseFrame } from "#runtime/protocol/frames.ts";
import type { ResponseMethod } from "#runtime/protocol/protocol-methods.ts";
import type { ResponsePayloads } from "#runtime/protocol/protocol-decoder.ts";
import { redactRemoteError } from "#runtime/transport/clients/transport-errors.ts";
import type { RequestTombstone } from "#runtime/transport/clients/transport-internals.ts";
import type {
	TransportIssue,
	TransportLateResponse,
	TransportLateResponseFor,
} from "#runtime/transport/clients/transport-types.ts";
import { cloneAndFreeze, jsonByteLength } from "#runtime/transport/operations/public-values.ts";

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
 * @param result The decoded result.
 * @returns The result, redacted, or malformed record.
 */
function resultRecord(context: LateContext, result: ResponsePayloads[ResponseMethod]): LateRecord {
	try {
		const retained = cloneAndFreeze(result);
		const resultBytes = jsonByteLength(retained);
		return resultBytes > CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes
			? {
					...context,
					kind: "redacted",
					payload: { reason: "retained-size", byteLength: resultBytes },
				}
			: { ...context, kind: "result", payload: retained };
	} catch {
		return { ...context, ...MALFORMED };
	}
}

/**
 * Builds the late record a response frame deserves: its result, its JSON-RPC error, or
 * malformed when it carries neither or does not decode for the tombstone's method.
 * @param context The shared fields.
 * @param frame The response frame.
 * @returns The record classified by what the frame carried.
 */
function lateRecord(context: LateContext, frame: ResponseFrame): LateRecord {
	if (frame.outcome === "malformed") return { ...context, ...MALFORMED };
	const body = decodeFrameBody(frame, context.method);
	if (!body.ok) return { ...context, ...MALFORMED };
	return body.value.outcome === "result"
		? resultRecord(context, body.value.result)
		: { ...context, kind: "error", payload: redactRemoteError(body.value.error) };
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
	readonly retain: (tombstone: RetainedTombstone, frame: ResponseFrame) => void;
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
	 * @param frame The response frame.
	 */
	const retain = (tombstone: RetainedTombstone, frame: ResponseFrame): void => {
		const context = lateContext(tombstone);
		const late = boundedRecord(lateRecord(context, frame), context);
		if (values.length >= CODEX_APP_SERVER_CAPACITY.retention.lateResponses) {
			values.shift();
		}
		// The record was decoded with the tombstone's own method, so its payload matches that
		// method; TypeScript cannot fold the widened member back into the method-indexed union.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- payload decoded for its own method
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
