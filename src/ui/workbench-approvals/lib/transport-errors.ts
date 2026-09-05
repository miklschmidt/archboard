// Reading a thrown transport error without depending on the transport's
// error class: the facts it carries are read structurally.

import { BROWSER_GATEWAY_ERROR_CODES } from "@/shared/codex-browser-gateway";
import type { DeliveryOutcome } from "@/shared/codex-browser-model";
import type {
	WorkbenchTransportErrorCode,
	WorkbenchTransportErrorFacts,
} from "@/ui/workbench-approvals/transport-port";

const CODES: ReadonlySet<string> = new Set<WorkbenchTransportErrorCode>([
	...BROWSER_GATEWAY_ERROR_CODES,
	"gateway_error",
	"socket_unavailable",
	"response_lost",
	"replaced",
	"incompatible_contract",
]);

const OUTCOMES: ReadonlySet<string> = new Set<DeliveryOutcome>([
	"delivered",
	"not_delivered",
	"outcome_unknown",
]);

/**
 * Whether a value is a delivery outcome.
 * @param value The value.
 * @returns True for the three outcomes.
 */
function isOutcome(value: unknown): value is DeliveryOutcome {
	return typeof value === "string" && OUTCOMES.has(value);
}

/**
 * Whether a value is a code the transport can carry.
 * @param value The value.
 * @returns True for a known code.
 */
function isCode(value: unknown): value is WorkbenchTransportErrorCode {
	return typeof value === "string" && CODES.has(value);
}

/**
 * The transport facts a thrown error carries, when it is a transport error.
 * @param error The thrown value.
 * @returns Its code, outcome and message, or null for any other error.
 */
function transportErrorFacts(error: unknown): WorkbenchTransportErrorFacts | null {
	if (!(error instanceof Error) || !("code" in error) || !("outcome" in error)) {
		return null;
	}
	const { code, outcome } = error;
	if (!isCode(code) || !isOutcome(outcome)) {
		return null;
	}
	return { code, outcome, message: error.message };
}

export { transportErrorFacts };
