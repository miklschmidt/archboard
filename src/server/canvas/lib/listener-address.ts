import net from "net";
import { logger } from "@/runtime/engine/logger";

const PORT = parseInt(process.env["PORT"] || "3000", 10);
const HOST = process.env["HOST"] || "127.0.0.1";
const LOOPBACK_GUARD_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "::"]);
const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"];

/**
 * A host as it appears in a URL: bracketed when it is an IPv6 literal.
 * @param host The host.
 * @returns The URL form.
 */
function formatHostForUrl(host: string): string {
	return host.includes(":") ? `[${host}]` : host;
}

/**
 * The URL this canvas is reachable at.
 * @returns The base URL.
 */
function canvasUrl(): string {
	return `http://${formatHostForUrl(HOST)}:${PORT}`;
}

/**
 * Whether something already accepts connections at a host and port.
 * @param host The host.
 * @param port The port.
 * @returns True when a connection opened within the probe's timeout.
 */
function canConnect(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const socket = net.createConnection({ host, port });
		/**
		 * Settle the probe once, whichever event arrives first.
		 * @param isOpen Whether the connection opened.
		 */
		const finish = (isOpen: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(isOpen);
		};
		socket.setTimeout(250);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

/**
 * Which loopback address, if any, already has a listener on the port. Both
 * are probed so an IPv4 and an IPv6 canvas cannot split state between them.
 * @param port The port.
 * @returns The listening loopback address, or null.
 */
async function findExistingLoopbackListener(port: number): Promise<string | null> {
	for (const host of LOOPBACK_ADDRESSES) {
		// oxlint-disable-next-line no-await-in-loop -- the first listener found answers; probing both at once would open a second socket for nothing
		if (await canConnect(host, port)) {
			return host;
		}
	}
	return null;
}

/**
 * Whether the configured host is one the duplicate-listener guard applies to.
 * @returns True for a loopback or wildcard host.
 */
function isLoopbackGuardedHost(): boolean {
	return LOOPBACK_GUARD_HOSTS.has(HOST);
}

/**
 * Log an HTTP server failure in the words that explain it.
 * @param error The failure.
 */
function logHttpServerError(error: NodeJS.ErrnoException): void {
	if (error.code === "EADDRINUSE") {
		const bound: unknown = Reflect.get(error, "address");
		const address = typeof bound === "string" ? bound : HOST;
		logger.error(`Canvas server port ${PORT} is already in use on ${formatHostForUrl(address)}.`);
	} else if (error.code === "EACCES") {
		logger.error(`Canvas server cannot bind ${formatHostForUrl(HOST)}:${PORT}: permission denied.`);
	} else {
		logger.error("Canvas HTTP server failed:", error);
	}
}

export {
	canvasUrl,
	findExistingLoopbackListener,
	formatHostForUrl,
	HOST,
	isLoopbackGuardedHost,
	logHttpServerError,
	PORT,
};
