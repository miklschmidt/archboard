// Where this server process listens, the refusal to start beside a server on the other loopback
// address, and the words for a listener that failed.

import net from "net";
import { logger } from "@archboard/diagnostics/logger";
import { defaultArchboardUrl } from "@archboard/workspace/source-checkout";

// The CLI names the port when it starts a server. Started by hand, a server
// takes the port that the CLI of its installation expects: a checkout's own, or the release
// port (ADR 0049, 0076).
const PORT = parseInt(process.env["PORT"] || new URL(defaultArchboardUrl()).port, 10);
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

/** Where this server listens, and the URLs it is reached at. */
interface ListenAddress {
	readonly host: string;
	readonly port: number;
	/** The base URL of the API. */
	readonly httpUrl: string;
	/** The base URL of the panes' socket. */
	readonly wsUrl: string;
}

/** Where this server listens, resolved once: the process reads its environment at start. */
const ADDRESS: ListenAddress = Object.freeze({
	host: HOST,
	port: PORT,
	httpUrl: `http://${formatHostForUrl(HOST)}:${PORT}`,
	wsUrl: `ws://${formatHostForUrl(HOST)}:${PORT}`,
});

/**
 * Where this server listens.
 * @returns The host and the port it binds, and the URLs they make.
 */
function listenAddress(): ListenAddress {
	return ADDRESS;
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
 * Which loopback address, if any, already has a listener on this server's port. Both
 * are probed so an IPv4 and an IPv6 server cannot split state between them.
 * @returns The listening loopback address, or null.
 */
async function existingLoopbackListener(): Promise<string | null> {
	for (const host of LOOPBACK_ADDRESSES) {
		// oxlint-disable-next-line no-await-in-loop -- the first listener found answers; probing both at once would open a second socket for nothing
		if (await canConnect(host, PORT)) {
			return host;
		}
	}
	return null;
}

/**
 * Refuse to start beside a server already listening on the other loopback
 * address, which would split state between an IPv4 and an IPv6 server. The
 * refusal is logged as well as returned.
 * @returns The refusal, or null when the host is not a loopback or wildcard one, or the port is
 *   free on both loopback addresses.
 */
async function loopbackRefusal(): Promise<string | null> {
	if (!LOOPBACK_GUARD_HOSTS.has(HOST)) {
		return null;
	}
	const existingHost = await existingLoopbackListener();
	if (!existingHost) {
		return null;
	}
	const message =
		`Refusing to start Archboard server on ${formatHostForUrl(HOST)}:${PORT}: ` +
		`${formatHostForUrl(existingHost)}:${PORT} is already listening. ` +
		"This prevents duplicate IPv4/IPv6 Archboard servers from splitting state.";
	logger().error(message);
	return message;
}

/**
 * Log an HTTP server failure in the words that explain it.
 * @param error The failure.
 */
function logHttpServerError(error: NodeJS.ErrnoException): void {
	if (error.code === "EADDRINUSE") {
		const bound: unknown = Reflect.get(error, "address");
		const address = typeof bound === "string" ? bound : HOST;
		logger().error(
			`Archboard server port ${PORT} is already in use on ${formatHostForUrl(address)}.`,
		);
	} else if (error.code === "EACCES") {
		logger().error(
			`Archboard server cannot bind ${formatHostForUrl(HOST)}:${PORT}: permission denied.`,
		);
	} else {
		logger().error("Archboard HTTP server failed:", error);
	}
}

export { listenAddress, logHttpServerError, loopbackRefusal };
