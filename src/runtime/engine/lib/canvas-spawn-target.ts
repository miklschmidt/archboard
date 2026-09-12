// Where the canvas is expected to answer, and how the launcher tells that
// answer apart from a foreign service or a canvas holding unsaved work.

import { EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import { getHealth, CANVAS_SERVICE_NAME, type HealthStatus } from "@/runtime/engine/canvas-client";
import { codedError } from "@/runtime/engine/lib/thrown-error";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The port the canvas URL names, with the scheme's default when it names none.
 * @returns The port number; 3000 when the URL cannot be parsed.
 */
function canvasPort(): number {
	try {
		const url = new URL(EXPRESS_SERVER_URL);
		return parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80);
	} catch {
		return 3000;
	}
}

/**
 * The host the canvas URL names.
 * @returns The hostname; the IPv4 loopback when the URL cannot be parsed.
 */
function canvasHostname(): string {
	try {
		return new URL(EXPRESS_SERVER_URL).hostname;
	} catch {
		return "127.0.0.1";
	}
}

/**
 * The HOST the spawned server must bind so that health probes against
 * EXPRESS_SERVER_URL actually reach it: a `[::1]` URL needs an IPv6 bind.
 * @returns The bind address without URL brackets.
 */
function spawnBindHost(): string {
	const hostname = canvasHostname();
	if (hostname === "localhost") {
		return "127.0.0.1";
	}
	return hostname.replace(/^\[|\]$/g, "");
}

/**
 * Whether the canvas URL points at this machine, which is the only place an
 * auto-start can put a server.
 * @returns True for a loopback host.
 */
function isLoopbackUrl(): boolean {
	return LOOPBACK_HOSTS.has(canvasHostname());
}

/**
 * The error a caller gets when no canvas answers and none will be started.
 * @param reason Why, in a clause that follows the URL.
 * @returns An error carrying the `CANVAS_UNREACHABLE` code.
 */
function unreachableError(reason: string): Error {
	return codedError(
		`Canvas server is not reachable at ${EXPRESS_SERVER_URL} (${reason}). ` +
			`Start it with \`archboard start\` (\`./bin/canvas start\` in the repo) or \`bun src/server.ts\`.`,
		"CANVAS_UNREACHABLE",
	);
}

/**
 * A start that was refused, in the server's or the launcher's own words.
 * @param message The refusal text.
 * @returns An error carrying the `CANVAS_UNREACHABLE` code.
 */
function startupRefusal(message: string): Error {
	return codedError(message.trim(), "CANVAS_UNREACHABLE");
}

/**
 * Probe `/health`, treating any failure as no answer.
 * @returns The health payload, or null when nothing usable answered.
 */
async function healthOrNull(): Promise<HealthStatus | null> {
	try {
		return await getHealth();
	} catch {
		return null;
	}
}

/**
 * Whether a `/health` payload came from OUR canvas server (the v1.1+ identity
 * marker). Anything else answering the port is a foreign service.
 * @param health The payload, or null when nothing answered.
 * @returns True only for this canvas service.
 */
function isCanvasHealth(health: { service?: string } | null): boolean {
	return health?.service === CANVAS_SERVICE_NAME;
}

export {
	canvasPort,
	spawnBindHost,
	isLoopbackUrl,
	unreachableError,
	startupRefusal,
	healthOrNull,
	isCanvasHealth,
};
