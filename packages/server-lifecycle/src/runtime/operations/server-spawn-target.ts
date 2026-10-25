// Where the Archboard server is expected to answer, and how the launcher tells that
// answer apart from a foreign service or a server holding unsaved work.

import { ARCHBOARD_URL } from "#runtime/services/config.ts";
import { getHealth, type HealthStatus } from "#runtime/clients/server-client.ts";
import {
	ARCHBOARD_SERVICE_NAME,
	OtherSourceError,
} from "#runtime/clients/server-client-transport.ts";
import { codedError } from "@archboard/diagnostics/thrown-error";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The port the server URL names, with the scheme's default when it names none.
 * @returns The port number; 3000 when the URL cannot be parsed.
 */
function serverPort(): number {
	try {
		const url = new URL(ARCHBOARD_URL);
		return parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80);
	} catch {
		return 3000;
	}
}

/**
 * The host the server URL names.
 * @returns The hostname; the IPv4 loopback when the URL cannot be parsed.
 */
function serverHostname(): string {
	try {
		return new URL(ARCHBOARD_URL).hostname;
	} catch {
		return "127.0.0.1";
	}
}

/**
 * The HOST the spawned server must bind so that health probes against
 * ARCHBOARD_URL actually reach it: a `[::1]` URL needs an IPv6 bind.
 * @returns The bind address without URL brackets.
 */
function spawnBindHost(): string {
	const hostname = serverHostname();
	if (hostname === "localhost") {
		return "127.0.0.1";
	}
	return hostname.replace(/^\[|\]$/g, "");
}

/**
 * Whether the server URL points at this machine, which is the only place an
 * auto-start can put a server.
 * @returns True for a loopback host.
 */
function isLoopbackUrl(): boolean {
	return LOOPBACK_HOSTS.has(serverHostname());
}

/**
 * The error a caller gets when no server answers and none will be started.
 * @param reason Why, in a clause that follows the URL.
 * @returns An error carrying the `SERVER_UNREACHABLE` code.
 */
function unreachableError(reason: string): Error {
	return codedError(
		`Archboard server is not reachable at ${ARCHBOARD_URL} (${reason}). ` +
			`Start it with \`archboard start\` (\`./bin/archboard start\` in the repo) or \`bun apps/server/src/server.ts\`.`,
		"SERVER_UNREACHABLE",
	);
}

/**
 * A start that was refused, in the server's or the launcher's own words.
 * @param message The refusal text.
 * @returns An error carrying the `SERVER_UNREACHABLE` code.
 */
function startupRefusal(message: string): Error {
	return codedError(message.trim(), "SERVER_UNREACHABLE");
}

/**
 * Probe `/health`, treating any failure as no answer, except a server that
 * runs another checkout's source: that server answers, and the caller must
 * neither start another on its port nor signal it.
 * @returns The health payload, or null when nothing usable answered.
 * @throws {OtherSourceError} When the server runs another checkout's source.
 */
async function healthOrNull(): Promise<HealthStatus | null> {
	try {
		return await getHealth();
	} catch (error) {
		if (error instanceof OtherSourceError) {
			throw error;
		}
		return null;
	}
}

/**
 * Whether a `/health` payload came from OUR Archboard server (the v1.1+ identity
 * marker). Anything else answering the port is a foreign service.
 * @param health The payload, or null when nothing answered.
 * @returns True only for this Archboard server.
 */
function isServerHealth(health: { service?: string } | null): boolean {
	return health?.service === ARCHBOARD_SERVICE_NAME;
}

export {
	serverPort,
	spawnBindHost,
	isLoopbackUrl,
	unreachableError,
	startupRefusal,
	healthOrNull,
	isServerHealth,
};
