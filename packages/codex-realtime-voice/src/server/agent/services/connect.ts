import { admitsOrigin, surfaceOf, type UpgradeRequest } from "#server/agent/services/admission.ts";
import type { createWorkbenchBrowserConnections } from "#server/browser-socket/services/connections.ts";
import type { TabSessionId } from "#server/tab-session/rules/tab-session.ts";

// One browser socket's connection to the agent, whichever library holds the socket: the route
// that names who it is, the frames it hands over, and its release. A connection registers at
// once, before the agent is ready and across Codex restarts, so a socket never has to come back
// because Codex was not there yet.

/** The socket a host hands the agent: how to send one text frame, and how to close it. */
export interface VoiceSocket {
	/**
	 * Send one text frame. Return, or resolve, once the socket took it; throw, or reject, when it
	 * cannot, so that the agent counts the frame as unsent.
	 */
	readonly send: (data: string) => void | Promise<void>;
	/**
	 * Close the socket. The agent closes only a socket whose route is a `{ request }`: with 1008
	 * when it refuses the upgrade, and with 1001 when it shuts down.
	 */
	readonly close: (code: number, reason: string) => void;
}

/**
 * Who a socket is. A `{ request }` route reads it from the upgrade: the agent checks the origin and
 * the `tabSessionId` and `chatId` of its URL, as the browser client sends them. A route that
 * names its identity itself is the host's to admit: the agent checks neither origin nor checkout.
 */
export type VoiceRoute =
	| {
			/** The upgrade request: its absolute URL and its headers. */
			readonly request: UpgradeRequest;
			/** The admitted checkout the socket works in. Default: the only listed checkout. */
			readonly checkout?: string;
	  }
	| {
			/** The tab session, or null for a socket that named none: its frames are refused. */
			readonly tabSessionId: TabSessionId | null;
			/**
			 * The browser id, which a later socket of the same chat reuses to replace this one. Null or
			 * left out for a socket without one: its frames are refused.
			 */
			readonly browserId?: string | null;
			/** The chat the socket shows, or how to read it: it is read on every frame. */
			readonly chat: string | (() => string | null);
			/** The checkout that the tab shows first, or how to read it when the tab first needs it. */
			readonly checkout?: string | (() => string);
	  };

/** A registered socket: hand it every frame, and release it once its socket closed. */
export interface VoiceConnection {
	/**
	 * Hand over one parsed frame.
	 * @returns False at once for a frame that is not a voice request, which the host handles
	 * itself. For a voice request, a promise that resolves once it is answered, a refusal
	 * included, and rejects when the socket was replaced or released or its answer could not be
	 * sent.
	 */
	readonly receive: (frame: unknown) => false | Promise<void>;
	/**
	 * Release the connection once its socket closed, or to stop serving it. A later call is the
	 * first one's outcome.
	 */
	readonly close: () => Promise<void>;
}

type Connections = ReturnType<typeof createWorkbenchBrowserConnections>;
type Transport = Parameters<Connections["register"]>[0]["transport"];

/** What the connector reads from the agent. */
interface ConnectorOptions {
	readonly connections: Connections;
	/** The agent's admitted path for a named checkout, or null for a refused one. */
	readonly admit: (named: string) => string | null;
	/** The checkout a socket works in when its route names none, or undefined when none is. */
	readonly onlyCheckout: string | undefined;
	/** The origins admitted beside the loopback default. */
	readonly origins: ReadonlySet<string>;
}

/** A connection whose socket the agent refused or released: it serves nothing. */
const RELEASED: VoiceConnection = Object.freeze({
	/**
	 * Hand over nothing.
	 * @param frame The frame.
	 * @returns False for a foreign frame, else a rejection.
	 */
	receive: (frame: unknown) =>
		isVoiceRequest(frame)
			? Promise.reject(new Error("The voice connection is closed."))
			: (false as const),
	/**
	 * Nothing to release.
	 * @returns Resolved.
	 */
	close: () => Promise.resolve(),
});

/**
 * Whether a frame is a voice request.
 * @param frame The parsed frame.
 * @returns True for a `codex_workbench_request`.
 */
function isVoiceRequest(frame: unknown): frame is Record<string, unknown> {
	return (
		typeof frame === "object" &&
		frame !== null &&
		"type" in frame &&
		frame.type === "codex_workbench_request"
	);
}

/**
 * A reader that always reads one value.
 * @param value The value.
 * @returns The reader.
 */
function always<Value>(value: Value): () => Value {
	/**
	 * Read the value.
	 * @returns It.
	 */
	return () => value;
}

/**
 * The refusal of one voice request, in the envelope of every answer.
 * @param frame The request.
 * @param error Why it is refused.
 * @returns The answer.
 */
function refusal(frame: Record<string, unknown>, error: string): Record<string, unknown> {
	const requestId = typeof frame["requestId"] === "string" ? frame["requestId"] : null;
	const action = typeof frame["action"] === "string" ? frame["action"] : null;
	return { type: "codex_workbench_result", requestId, action, ok: false, error };
}

/** One registration's identity. */
interface Identity {
	readonly browserId: string;
	readonly tabSessionId: TabSessionId;
	readonly chat: () => string | null;
	readonly checkout: () => string | undefined;
}

/**
 * What a route names: an identity, the refusal of every frame of a socket that names none, or
 * why a `{ request }` route's socket is refused.
 */
type Named =
	| { readonly identity: Identity }
	| { readonly unidentified: string }
	| { readonly refused: string };

/**
 * Make the agent's `connect`, and the shutdown of every connection it made.
 * @param options The registry, the checkout admission and the admitted origins.
 * @returns `connect`, and `closeAll` for shutdown.
 */
export function createVoiceConnector(options: ConnectorOptions) {
	const { connections, admit, onlyCheckout, origins } = options;
	const live = new Map<VoiceConnection, VoiceSocket | null>();

	/**
	 * The admitted path of a checkout a route names.
	 * @param named The checkout.
	 * @returns Its admitted path.
	 * @throws {TypeError} When the agent does not admit it.
	 */
	const admitted = (named: string): string => {
		const checkout = admit(named);
		if (checkout === null)
			throw new TypeError(`The checkout ${named} is not admitted by this voice agent.`);
		return checkout;
	};

	/**
	 * The checkout a route's sockets work in.
	 * @param named The checkout the route names, if any.
	 * @returns How to read it.
	 * @throws {TypeError} When the route names none and the agent admits more than one.
	 */
	const checkoutOf = (named: string | undefined): (() => string) => {
		const checkout = admitted(named ?? requireOnlyCheckout());
		return () => checkout;
	};

	/**
	 * The only checkout, for a route that names none.
	 * @returns It.
	 * @throws {TypeError} When the agent admits more than one.
	 */
	const requireOnlyCheckout = (): string => {
		if (onlyCheckout === undefined)
			throw new TypeError(
				"Name the checkout these sockets work in: the agent admits more than one.",
			);
		return onlyCheckout;
	};

	/**
	 * Read what a route that carries its upgrade request names.
	 * @param route The route.
	 * @returns Its identity, or why its socket is refused.
	 */
	const requestNamed = (route: Extract<VoiceRoute, { readonly request: unknown }>): Named => {
		const checkout = checkoutOf(route.checkout);
		if (!admitsOrigin(route.request, origins))
			return { refused: "The voice socket's origin is not admitted." };
		const surface = surfaceOf(route.request);
		if (surface === null)
			return { refused: "Name the tabSessionId and chatId of the voice socket." };
		return { identity: { ...surface, chat: always(surface.chatId), checkout } };
	};

	/**
	 * How a route that names its identity reads its checkout.
	 * @param named The checkout or its reader, if any.
	 * @returns The reader.
	 */
	const hostCheckout = (named: string | (() => string) | undefined) => {
		if (typeof named === "function") return named;
		return named === undefined ? always(onlyCheckout) : checkoutOf(named);
	};

	/**
	 * Read what a route that names its identity names.
	 * @param route The route.
	 * @returns Its identity, or why it has none.
	 */
	const hostNamed = (route: Exclude<VoiceRoute, { readonly request: unknown }>): Named => {
		const { tabSessionId, browserId, chat } = route;
		const checkout = hostCheckout(route.checkout);
		if (browserId === undefined || browserId === null)
			return {
				unidentified: "The Codex workbench requires an authoritative browser connection identity.",
			};
		if (tabSessionId === null)
			return { unidentified: "The Codex workbench requires the browser tab session identity." };
		const reads = typeof chat === "function" ? chat : always(chat);
		return { identity: { browserId, tabSessionId, chat: reads, checkout } };
	};

	/**
	 * Answer one voice request of a registered socket, or refuse it while no Codex generation is
	 * installed.
	 * @param instance The socket.
	 * @param identity Who it is.
	 * @param frame The request.
	 * @param transport Where the answer goes.
	 * @returns The handling.
	 */
	const handle = async (
		instance: object,
		identity: Identity,
		frame: Record<string, unknown>,
		transport: Transport,
	): Promise<void> => {
		const handling = connections.handle(instance, identity.browserId, frame);
		await (handling ?? transport.send(refusal(frame, "The Codex workbench is unavailable.")));
	};

	/**
	 * Connect one socket.
	 * @param socket The socket.
	 * @param route Who it is.
	 * @returns Its connection.
	 * @throws {TypeError} When the route names a checkout the agent does not admit, or names none
	 * while the agent admits more than one.
	 */
	const connect = (socket: VoiceSocket, route: VoiceRoute): VoiceConnection => {
		const named = "request" in route ? requestNamed(route) : hostNamed(route);
		if ("refused" in named) {
			socket.close(1008, named.refused);
			return RELEASED;
		}
		const identity = "identity" in named ? named.identity : null;
		const instance = Object.freeze({});
		const transport = Object.freeze({
			/**
			 * Send one message as a text frame.
			 * @param message The message.
			 */
			send: async (message: unknown) => {
				await socket.send(JSON.stringify(message));
			},
		});
		if (identity !== null) connections.register({ ...identity, instance, transport });
		let closing: Promise<void> | undefined;
		const connection: VoiceConnection = Object.freeze({
			/**
			 * Hand over one frame.
			 * @param frame The parsed frame.
			 * @returns False for a frame that is not a voice request, else its answer.
			 */
			receive: (frame: unknown) => {
				if (!isVoiceRequest(frame)) return false;
				if (closing !== undefined)
					return Promise.reject(new Error("The voice connection is closed."));
				if ("unidentified" in named) return transport.send(refusal(frame, named.unidentified));
				return handle(instance, named.identity, frame, transport);
			},
			/**
			 * Release the connection, once.
			 * @returns Resolves once it is released.
			 */
			close: () => {
				closing ??= (async () => {
					live.delete(connection);
					if (identity !== null) await connections.close(instance, identity.browserId);
				})();
				return closing;
			},
		});
		live.set(connection, "request" in route ? socket : null);
		return connection;
	};

	return Object.freeze({
		connect,
		/**
		 * The admitted checkout of the sockets of a route that names this one, or none.
		 * @param named The checkout, if any.
		 * @returns Its admitted path.
		 * @throws {TypeError} When it is not admitted, or none is named while the agent admits more
		 * than one.
		 */
		checkoutFor: (named: string | undefined) => checkoutOf(named)(),
		/**
		 * Close every socket the agent admitted itself and release every connection.
		 * @returns Resolves once each is released.
		 */
		closeAll: async () => {
			const open = [...live];
			for (const [, socket] of open) socket?.close(1001, "The voice agent stopped.");
			await Promise.all(open.map(([connection]) => connection.close()));
		},
	});
}
