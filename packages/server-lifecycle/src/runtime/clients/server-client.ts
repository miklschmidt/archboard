// What the lifecycle asks a running Archboard server about itself, and how a refused board
// request is shown.
//
// One request goes through `server-client-transport.ts`, which owns the identity gate and the
// error shapes; what this invocation says about itself — which board, what it is doing, which
// version it believes it is editing — lives in `state/server-client-session.ts` and rides on every
// request from there rather than from every call site.

import type { SourceState } from "#runtime/services/staleness.ts";
import { type BoardRefusal, isBoardRefusal } from "#runtime/protocol/server-client-refusal.ts";
import { requestJson } from "#runtime/clients/server-client-transport.ts";
import { isRecord } from "@archboard/diagnostics/unknown-record";

/** What `/health` answers with. */
interface HealthStatus {
	status: string;
	service?: string;
	pid?: number;
	/** How many browsers are looking at this server. */
	websocket_clients?: number;
	/**
	 * Which checkout's source the server runs, and whether it is the source on
	 * disk now. A server older than ADR 0049 names no checkout.
	 */
	source?: Omit<SourceState, "checkout"> & Partial<Pick<SourceState, "checkout">>;
	[key: string]: unknown;
}

/**
 * Whether the server is up, and whether it is the Archboard server rather than something
 * else listening on the port.
 * @returns The health body.
 */
function getHealth(): Promise<HealthStatus> {
	return requestJson<HealthStatus>("/health");
}

/**
 * What the server is holding, for `status`.
 * @returns The sync status body.
 */
function getSyncStatus(): Promise<Record<string, unknown>> {
	return requestJson("/api/sync/status");
}

/**
 * The refusal a thrown value carries, when it carries one.
 * @param error The thrown value.
 * @returns The refusal, or null.
 */
function boardRefusalOf(error: unknown): BoardRefusal | null {
	const refusal = isRecord(error) ? error["refusal"] : undefined;
	return isBoardRefusal(refusal) ? refusal : null;
}

/**
 * A refusal as the CLI prints it: the unchanged reason first, then every
 * structured fact from the same body.
 * @param error The thrown value.
 * @returns The text, or null when the error is not a refusal.
 */
function formatBoardRefusal(error: unknown): string | null {
	const refusal = boardRefusalOf(error);
	if (!refusal) {
		return null;
	}
	const { success: _success, error: reason, ...details } = refusal;
	return `${reason}\n\n${JSON.stringify(details, null, 2)}`;
}

export { type HealthStatus, formatBoardRefusal, getHealth, getSyncStatus };
