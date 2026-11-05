// What the lifecycle asks a running Archboard server about itself.
//
// One request goes through `server-client-transport.ts`, which owns the identity gate and the
// error shapes; what this invocation says about itself — which model, what it is doing, which
// version it believes it is editing — lives in `state/server-client-session.ts` and rides on every
// request from there rather than from every call site.

import type { SourceState } from "#runtime/services/staleness.ts";
import { requestJson } from "#runtime/clients/server-client-transport.ts";

/** What `/health` answers with. */
interface HealthStatus {
	status: string;
	service?: string;
	pid?: number;
	/** The version of the installation the server runs. A server older than ADR 0075 names none. */
	version?: string;
	/** Whether the server runs a checkout's source or a release. */
	mode?: "checkout" | "release";
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

export { type HealthStatus, getHealth, getSyncStatus };
