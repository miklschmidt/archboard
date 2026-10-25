// What answers at the server URL: nothing, something that is not this checkout's
// Archboard server, or the server with what it reports about itself.

import { ARCHBOARD_URL } from "#runtime/services/config.ts";
import {
	getHealth,
	getSyncStatus,
	OtherSourceError,
	type HealthStatus,
} from "#runtime/clients/server-client.ts";
import { isServerHealth, serverPort } from "#runtime/operations/server-spawn-target.ts";
import { readPidFile } from "#runtime/store/pidfile.ts";

/** What answers at the server URL. */
type ServerStatus =
	| { readonly state: "absent"; readonly url: string }
	| {
			readonly state: "conflict";
			readonly url: string;
			/** What answers instead: another service, an older build, or another checkout's server. */
			readonly conflict: string;
	  }
	| {
			readonly state: "running";
			readonly url: string;
			/** The pid the server reports, else the one its pid file records. */
			readonly pid: number | undefined;
			/** How many browsers are looking at the server. */
			readonly browserClients: number | undefined;
			/** Which checkout's source the server runs, and whether it is the source on disk now. */
			readonly source: HealthStatus["source"];
			/** The synchronization state, empty when it could not be read. */
			readonly sync: Record<string, unknown>;
	  };

/**
 * Reads the synchronization state, which is an addition to a status rather
 * than part of it: a server that answered its health has already reported
 * everything a status must contain.
 * @returns The synchronization fields, or nothing when they could not be read.
 */
async function bestEffortSyncStatus(): Promise<Record<string, unknown>> {
	try {
		return await getSyncStatus();
	} catch {
		return {};
	}
}

/**
 * What answers at the server URL. Never starts a server and never throws for
 * one that is absent or foreign: each is a status.
 * @returns Nothing, a conflict naming what answers instead, or the running server.
 */
async function serverStatus(): Promise<ServerStatus> {
	let health: HealthStatus;
	try {
		health = await getHealth();
	} catch (error) {
		return error instanceof OtherSourceError
			? { state: "conflict", url: ARCHBOARD_URL, conflict: error.message }
			: { state: "absent", url: ARCHBOARD_URL };
	}
	if (!isServerHealth(health)) {
		return {
			state: "conflict",
			url: ARCHBOARD_URL,
			conflict: "another service (or a pre-1.1 Archboard server build) is answering at this URL",
		};
	}
	return {
		state: "running",
		url: ARCHBOARD_URL,
		pid: health.pid ?? readPidFile(serverPort()) ?? undefined,
		browserClients: health.websocket_clients,
		source: health.source,
		sync: await bestEffortSyncStatus(),
	};
}

/**
 * How many browsers are looking at the server, for a command that needs one.
 * @returns The count the server reports, or undefined when it reports none.
 * @throws {Error} When the server is not there or is not itself.
 */
async function connectedBrowsers(): Promise<number | undefined> {
	return (await getHealth()).websocket_clients;
}

export { type ServerStatus, connectedBrowsers, serverStatus };
