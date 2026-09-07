// A minimal Chrome DevTools Protocol client over the browser's private
// loopback WebSocket: calls with timeouts, page evaluation and the event
// log the proof reads diagnostics from.
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { isRecord, recordAt, type JsonRecord } from "./proof-values.ts";

interface CdpEvent {
	method: string;
	params: JsonRecord;
}

interface PendingCall {
	resolve(value: JsonRecord): void;
	reject(reason: Error): void;
}

/** A DevTools command that did not answer within its allowance. */
class CdpTimeoutError extends Error {
	readonly method: string;
	readonly timeoutMs: number;

	/**
	 * Name the command and its allowance.
	 * @param method The DevTools method.
	 * @param timeoutMs The allowance that elapsed.
	 */
	constructor(method: string, timeoutMs: number) {
		super(`DevTools ${method} timed out after ${timeoutMs} ms.`);
		this.name = "CdpTimeoutError";
		this.method = method;
		this.timeoutMs = timeoutMs;
	}
}

/**
 * Whether an event is worth keeping as a page diagnostic: console output,
 * exceptions, failed loads, error responses and log entries.
 * @param event The DevTools event.
 * @returns Whether the event is a diagnostic.
 */
function isDiagnosticEvent(event: CdpEvent): boolean {
	if (event.method === "Runtime.consoleAPICalled" || event.method === "Runtime.exceptionThrown") {
		return true;
	}
	if (event.method === "Network.loadingFailed") {
		return true;
	}
	if (event.method === "Network.responseReceived") {
		const status = recordAt(event.params, "response")?.["status"];
		return typeof status === "number" && status >= 400;
	}
	return event.method === "Log.entryAdded";
}

/** The DevTools connection to one renderer target. */
class Cdp {
	readonly #pending = new Map<number, PendingCall>();
	readonly #requests = new Map<string, string>();
	readonly events: CdpEvent[] = [];
	#nextId = 1;
	readonly socket: WebSocket;

	/**
	 * Wrap an open socket.
	 * @param socket The DevTools WebSocket.
	 */
	private constructor(socket: WebSocket) {
		this.socket = socket;
		socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
		socket.addEventListener("error", () => this.rejectPending("DevTools socket failed."));
		socket.addEventListener("close", () => this.rejectPending("DevTools socket closed."));
	}

	/**
	 * Open a DevTools socket, allowing five seconds for the handshake.
	 * @param url The target's WebSocket debugger URL.
	 * @returns The connected client.
	 * @throws {Error} When the socket does not open in time.
	 */
	static async connect(url: string): Promise<Cdp> {
		const socket = new WebSocket(url);
		await new Promise<void>((fulfill, reject) => {
			const timeout = setTimeout(() => reject(new Error("DevTools socket did not open.")), 5_000);
			socket.addEventListener("open", () => {
				clearTimeout(timeout);
				fulfill();
			});
			socket.addEventListener("error", () => {
				clearTimeout(timeout);
				reject(new Error("DevTools socket could not open."));
			});
		});
		return new Cdp(socket);
	}

	/**
	 * Send one command and wait for its result.
	 * @param method The DevTools method.
	 * @param params The method parameters.
	 * @param timeoutMs How long to wait for the answer.
	 * @returns The command result.
	 * @throws {CdpTimeoutError} When no answer arrives in time.
	 */
	async call(method: string, params: JsonRecord = {}, timeoutMs = 5_000): Promise<JsonRecord> {
		const id = this.#nextId++;
		return await new Promise<JsonRecord>((fulfill, reject) => {
			const timeout = setTimeout(() => {
				this.#pending.delete(id);
				reject(new CdpTimeoutError(method, timeoutMs));
			}, timeoutMs);
			this.#pending.set(id, {
				resolve: (result) => {
					clearTimeout(timeout);
					fulfill(result);
				},
				reject: (reason) => {
					clearTimeout(timeout);
					reject(reason);
				},
			});
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}

	/**
	 * Evaluate an expression in the page, awaiting a returned promise.
	 * @param expression The JavaScript to evaluate.
	 * @param timeoutMs How long to wait for the value.
	 * @returns The value, serialised by value.
	 * @throws {Error} When the page threw.
	 */
	async evaluate(expression: string, timeoutMs = 5_000): Promise<unknown> {
		const answer = await this.call(
			"Runtime.evaluate",
			{ expression, awaitPromise: true, returnByValue: true },
			timeoutMs,
		);
		if (answer["exceptionDetails"]) {
			throw new Error(`Page evaluation failed: ${JSON.stringify(answer["exceptionDetails"])}`);
		}
		return recordAt(answer, "result")?.["value"];
	}

	/** Close the socket. */
	close(): void {
		this.socket.close();
	}

	/**
	 * The last thirty diagnostic events, each with the URL of its request when known.
	 * @returns The diagnostics in arrival order.
	 */
	diagnostics(): JsonRecord[] {
		return this.events
			.filter(isDiagnosticEvent)
			.slice(-30)
			.map((event) => {
				const requestId = event.params["requestId"];
				return {
					method: event.method,
					url: typeof requestId === "string" ? this.#requests.get(requestId) : undefined,
					params: event.params,
				};
			});
	}

	/**
	 * Settle the pending call a response answers.
	 * @param id The call id.
	 * @param message The response.
	 */
	private settleCall(id: number, message: JsonRecord): void {
		const pending = this.#pending.get(id);
		if (!pending) {
			return;
		}
		this.#pending.delete(id);
		const error = recordAt(message, "error");
		if (error) {
			const text = error["message"];
			pending.reject(new Error(typeof text === "string" ? text : "DevTools command failed."));
		} else {
			pending.resolve(recordAt(message, "result") ?? {});
		}
	}

	/**
	 * Record an event, remembering request URLs for later diagnostics.
	 * @param method The event method.
	 * @param params The event parameters.
	 */
	private recordEvent(method: string, params: JsonRecord): void {
		if (method === "Network.requestWillBeSent") {
			const url = recordAt(params, "request")?.["url"];
			if (typeof params["requestId"] === "string" && typeof url === "string") {
				this.#requests.set(params["requestId"], url);
			}
		}
		this.events.push({ method, params });
	}

	/**
	 * Route one socket message to its pending call or the event log.
	 * @param raw The message text.
	 */
	private onMessage(raw: string): void {
		const message: unknown = JSON.parse(raw);
		if (!isRecord(message)) {
			return;
		}
		if (typeof message["id"] === "number") {
			this.settleCall(message["id"], message);
			return;
		}
		if (typeof message["method"] === "string") {
			this.recordEvent(message["method"], recordAt(message, "params") ?? {});
		}
	}

	/**
	 * Fail every pending call, for a failed or closed socket.
	 * @param message The failure reason.
	 */
	private rejectPending(message: string): void {
		for (const pending of this.#pending.values()) {
			pending.reject(new Error(message));
		}
		this.#pending.clear();
	}
}

export { Cdp, CdpTimeoutError, type CdpEvent };
