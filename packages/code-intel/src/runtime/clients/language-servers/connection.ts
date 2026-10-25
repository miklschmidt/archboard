// JSON-RPC 2.0 with the framing of the Language Server Protocol, over the
// stdio of one child process: each message is a `Content-Length` header, a
// blank line and that many bytes of UTF-8 JSON.
//
// The client asks, and answers what the server asks with nothing: `null`,
// except `workspace/configuration`, whose each item gets the settings the
// project gives its section, or `null`, which tells a server to use its own
// default. Of the notifications it notes only the end of a work-done
// progress, which a client can wait for, and ignores every other, such as a
// log line or diagnostics. Each request and wait rejects when the caller
// cancels it or when the process ends.

import { z } from "zod";

/**
 * Why a request got no answer: the server answered with an error, its
 * process ended, or the pass was cancelled. Only an
 * error answer leaves the server fit to ask again.
 */
class RequestFailure extends Error {
	readonly kind: "answered" | "ended" | "cancelled";

	/**
	 * Name why a request got no answer.
	 * @param kind What happened.
	 * @param message What the server did, as the end of a sentence about it.
	 */
	constructor(kind: RequestFailure["kind"], message: string) {
		super(message);
		this.name = "RequestFailure";
		this.kind = kind;
	}
}

/** The process the connection speaks to. */
type ServerProcess = Bun.Subprocess<"pipe", "pipe", "ignore">;

/** One message as it arrives: an answer, a request, or a notification. */
const IncomingSchema = z.object({
	id: z.union([z.number(), z.string(), z.null()]).optional(),
	method: z.string().optional(),
	params: z
		.object({ items: z.array(z.unknown()).optional() })
		.loose()
		.optional()
		.catch(undefined),
	result: z.unknown().optional(),
	error: z.object({ message: z.string().optional() }).loose().optional(),
});

type Incoming = z.infer<typeof IncomingSchema>;

/** A request that waits for its answer. */
interface Pending {
	readonly resolve: (result: unknown) => void;
	readonly reject: (error: RequestFailure) => void;
}

/** How one request is bounded. */
interface RequestBounds {
	readonly signal: AbortSignal;
}

/** A connection to one language server. */
interface Connection {
	/** Ask the server, and wait for its answer within the bounds. */
	readonly request: (method: string, params: unknown, bounds: RequestBounds) => Promise<unknown>;
	/** Tell the server something that needs no answer. */
	readonly notify: (method: string, params?: unknown) => void;
	/** Wait, within the bounds, until the server has ended the work-done progress of a token. */
	readonly progressEnd: (token: string, bounds: RequestBounds) => Promise<void>;
}

/** The end of a work-done progress, as `$/progress` reports it. */
const ProgressEndSchema = z.object({
	token: z.union([z.string(), z.number()]),
	value: z.object({ kind: z.literal("end") }).loose(),
});

/** The blank line that ends a header. */
const HEADER_END = "\r\n\r\n";

/**
 * The bodies of every whole message in the bytes read so far.
 * @param buffered The bytes not yet taken.
 * @returns The bodies, and the bytes of a message not yet whole.
 */
function takeMessages(buffered: Buffer): { bodies: string[]; rest: Buffer } {
	const bodies: string[] = [];
	let rest = buffered;
	for (let end = rest.indexOf(HEADER_END); end >= 0; end = rest.indexOf(HEADER_END)) {
		const header = rest.toString("ascii", 0, end);
		const length = Number(/content-length:\s*(\d+)/iu.exec(header)?.[1] ?? Number.NaN);
		if (!Number.isInteger(length)) throw new Error("sent a message with no Content-Length");
		const start = end + HEADER_END.length;
		if (rest.length < start + length) break;
		bodies.push(rest.toString("utf8", start, start + length));
		rest = rest.subarray(start + length);
	}
	return { bodies, rest };
}

/**
 * Frame one message.
 * @param message The message.
 * @returns Its header and body.
 */
function framed(message: object): string {
	const body = JSON.stringify({ jsonrpc: "2.0", ...message });
	return `Content-Length: ${Buffer.byteLength(body, "utf8")}${HEADER_END}${body}`;
}

/** One item of `workspace/configuration`: the section it asks about, if it names one. */
const ConfigurationItemSchema = z.object({ section: z.string().optional() }).loose().catch({});

/**
 * One setting of a group of settings.
 * @param group The group.
 * @param name The setting's name.
 * @returns Its value, or undefined when the group is no group or has no such setting.
 */
function settingIn(group: unknown, name: string): unknown {
	return typeof group === "object" && group !== null ? Reflect.get(group, name) : undefined;
}

/**
 * The settings of a section, such as `python` or `python.pythonPath`.
 * @param settings The settings, by section.
 * @param section The section; none asks for every setting.
 * @returns Its settings, or `null` when there are none.
 */
function settingsOf(settings: Readonly<Record<string, unknown>>, section?: string): unknown {
	const names = section === undefined ? [] : section.split(".");
	return names.reduce<unknown>(settingIn, settings) ?? null;
}

/**
 * What the client answers a request from the server: the settings of each
 * section `workspace/configuration` asks about, and nothing else it knows of.
 * @param message The request.
 * @param settings The project's settings, by section.
 * @returns `null`, or the settings of each configuration item.
 */
function answerTo(message: Incoming, settings: Readonly<Record<string, unknown>>): unknown {
	if (message.method !== "workspace/configuration") return null;
	return (message.params?.items ?? []).map((item) =>
		settingsOf(settings, ConfigurationItemSchema.parse(item).section),
	);
}

/**
 * One message, or undefined when it is not JSON-RPC.
 * @param body Its JSON.
 * @returns The message.
 */
function parsed(body: string): Incoming | undefined {
	try {
		const message = IncomingSchema.safeParse(JSON.parse(body));
		return message.success ? message.data : undefined;
	} catch {
		return undefined;
	}
}

/** The requests that wait for an answer, by id. */
class PendingRequests {
	readonly #waiting = new Map<number, Pending>();
	#next = 0;

	/**
	 * Wait for the answer to a new request.
	 * @param bounds How long to wait, and the signal that ends the wait.
	 * @returns Its id, and the answer once it comes.
	 */
	open(bounds: RequestBounds): { id: number; answer: Promise<unknown> } {
		const id = (this.#next += 1);
		const answer = new Promise<unknown>((resolve, reject) => {
			/** Stop waiting. */
			const done = (): void => {
				bounds.signal.removeEventListener("abort", cancel);
				this.#waiting.delete(id);
			};
			/** The pass was cancelled. */
			const cancel = (): void => {
				done();
				reject(new RequestFailure("cancelled", "was cancelled with the pass"));
			};
			this.#waiting.set(id, {
				/**
				 * Take the answer.
				 * @param result What the server answered.
				 */
				resolve: (result) => {
					done();
					resolve(result);
				},
				/**
				 * Take the failure.
				 * @param error Why there is no answer.
				 */
				reject: (error) => {
					done();
					reject(error);
				},
			});
			bounds.signal.addEventListener("abort", cancel, { once: true });
			if (bounds.signal.aborted) cancel();
		});
		return { id, answer };
	}

	/**
	 * Settle a wait that is no request, such as one for the end of a progress.
	 * @param id Its id.
	 */
	release(id: number): void {
		this.#waiting.get(id)?.resolve(null);
	}

	/**
	 * Settle the request an answer is for.
	 * @param message The answer.
	 */
	settle(message: Incoming): void {
		const waiting = typeof message.id === "number" ? this.#waiting.get(message.id) : undefined;
		if (waiting === undefined) return;
		if (message.error === undefined) waiting.resolve(message.result ?? null);
		else
			waiting.reject(
				new RequestFailure("answered", `answered ${message.error.message ?? "an error"}`),
			);
	}

	/**
	 * Reject every request still waiting.
	 * @param reason Why the process ended.
	 */
	end(reason: string): void {
		for (const waiting of this.#waiting.values())
			waiting.reject(new RequestFailure("ended", reason));
	}
}

/**
 * Kill a server and every process it started. It runs in a process group of
 * its own, because a command can be a script that runs the real server as its
 * child, as nixpkgs' `clangd` does. Killing the script alone leaves the
 * server running.
 * @param child The server's process, the leader of its group.
 */
function killGroup(child: ServerProcess): void {
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

/**
 * Read every message the process writes until it closes its output.
 * @param child The process.
 * @param receive What handles each message.
 */
async function readAll(child: ServerProcess, receive: (message: Incoming) => void): Promise<void> {
	let buffered: Buffer = Buffer.alloc(0);
	try {
		for await (const chunk of child.stdout) {
			const taken = takeMessages(Buffer.concat([buffered, chunk]));
			buffered = taken.rest;
			for (const message of taken.bodies.map(parsed)) if (message !== undefined) receive(message);
		}
	} catch {
		killGroup(child);
	}
}

/**
 * Open a connection over a server's stdio. It reads until the process closes
 * its output, then rejects every request still waiting.
 * @param child The server's process.
 * @param closed Resolves with why the process ended, once it has.
 * @param settings What the server is told when it asks for its configuration, by section.
 * @returns The connection.
 */
function connect(
	child: ServerProcess,
	closed: Promise<string>,
	settings: Readonly<Record<string, unknown>>,
): Connection {
	const pending = new PendingRequests();
	let ended: string | undefined;
	const progressEnded = new Set<string>();
	const progressWaits = new Map<string, number[]>();

	/**
	 * Note a notification: the end of a work-done progress releases whoever
	 * waits for it.
	 * @param message The notification.
	 */
	const noted = (message: Incoming): void => {
		if (message.method !== "$/progress") return;
		const progress = ProgressEndSchema.safeParse(message.params);
		if (!progress.success) return;
		const token = String(progress.data.token);
		progressEnded.add(token);
		for (const id of progressWaits.get(token) ?? []) pending.release(id);
		progressWaits.delete(token);
	};

	/** The process can no longer take a message. */
	const refused = (): void => {
		ended ??= "stopped taking messages";
	};

	/**
	 * Write one message, or note that the process can no longer take one.
	 * @param message The message.
	 */
	const write = (message: object): void => {
		try {
			void Promise.resolve(child.stdin.write(framed(message))).catch(refused);
			void Promise.resolve(child.stdin.flush()).catch(refused);
		} catch {
			refused();
		}
	};

	void closed.then((reason) => {
		ended ??= reason;
		pending.end(ended);
		return undefined;
	});

	void (async () => {
		await readAll(child, (message) => {
			if (message.method === undefined) pending.settle(message);
			else if (message.id === undefined) noted(message);
			else write({ id: message.id, result: answerTo(message, settings) });
		});
		ended ??= await closed;
		pending.end(ended);
	})();

	return {
		/**
		 * Ask the server, and wait for its answer within the bounds.
		 * @param method The method.
		 * @param params Its params, if it has any.
		 * @param bounds How long to wait, and the signal that ends the wait.
		 * @returns The answer.
		 */
		request: (method, params, bounds) => {
			if (ended !== undefined) return Promise.reject(new RequestFailure("ended", ended));
			const { id, answer } = pending.open(bounds);
			write(params === undefined ? { id, method } : { id, method, params });
			return answer;
		},
		/**
		 * Tell the server something that needs no answer.
		 * @param method The method.
		 * @param params Its params, if it has any.
		 */
		notify: (method, params) => {
			write(params === undefined ? { method } : { method, params });
		},
		/**
		 * Wait until the server has ended the work-done progress of a token.
		 * @param token The token.
		 * @param bounds How long to wait, and the signal that ends the wait.
		 * @returns Once it has ended.
		 */
		progressEnd: async (token, bounds) => {
			if (progressEnded.has(token)) return;
			if (ended !== undefined) throw new RequestFailure("ended", ended);
			const { id, answer } = pending.open(bounds);
			progressWaits.set(token, [...(progressWaits.get(token) ?? []), id]);
			await answer;
		},
	};
}

export {
	type Connection,
	type RequestBounds,
	RequestFailure,
	type ServerProcess,
	connect,
	killGroup,
};
