import { isJsonRecord, type JsonRecord } from "@/server/board-rendering/lib/renderer-failure";

/** One DevTools event the page produced while a job was running. */
interface CdpEvent {
	readonly method: string;
	readonly params: JsonRecord;
}

/** One DevTools connection to the renderer page, and what it has reported. */
class Cdp {
	readonly #pending = new Map<
		number,
		{ resolve(value: JsonRecord): void; reject(reason: Error): void; timeout: Timer }
	>();
	readonly #events: CdpEvent[] = [];
	#nextId = 1;
	#closed = false;

	/**
	 * A connection is opened through connect, which owns the socket's own
	 * failure to open.
	 * @param socket The open DevTools socket.
	 */
	private constructor(readonly socket: WebSocket) {
		socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
		socket.addEventListener("error", () => this.rejectPending("Renderer DevTools socket failed."));
		socket.addEventListener("close", () => this.rejectPending("Renderer DevTools socket closed."));
	}

	/**
	 * Open a DevTools connection to one target.
	 * @param url The target's socket URL.
	 * @param timeoutMs How long to wait for it to open.
	 * @returns The connection.
	 */
	static async connect(url: string, timeoutMs: number): Promise<Cdp> {
		const socket = new WebSocket(url);
		await new Promise<void>((resolveConnection, rejectConnection) => {
			const timeout = setTimeout(
				() => rejectConnection(new Error("Renderer DevTools socket did not open.")),
				timeoutMs,
			);
			socket.addEventListener(
				"open",
				() => {
					clearTimeout(timeout);
					resolveConnection();
				},
				{ once: true },
			);
			socket.addEventListener(
				"error",
				() => {
					clearTimeout(timeout);
					rejectConnection(new Error("Renderer DevTools socket could not open."));
				},
				{ once: true },
			);
		});
		return new Cdp(socket);
	}

	/**
	 * Call one DevTools method and wait for its answer.
	 * @param method The method.
	 * @param params Its parameters.
	 * @param timeoutMs How long to wait.
	 * @returns The result.
	 */
	async call(method: string, params: JsonRecord = {}, timeoutMs: number): Promise<JsonRecord> {
		if (this.#closed) {
			throw new Error("Renderer DevTools connection is closed.");
		}
		const id = this.#nextId++;
		return await new Promise<JsonRecord>((resolveCall, rejectCall) => {
			const timeout = setTimeout(() => {
				this.#pending.delete(id);
				rejectCall(new Error(`Renderer DevTools ${method} timed out after ${timeoutMs} ms.`));
			}, timeoutMs);
			this.#pending.set(id, { resolve: resolveCall, reject: rejectCall, timeout });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}

	/**
	 * Evaluate one expression on the page and answer its value, turning a page
	 * exception into a failure here.
	 * @param expression The expression.
	 * @param timeoutMs How long to wait.
	 * @returns The value.
	 */
	async evaluate(expression: string, timeoutMs: number): Promise<unknown> {
		const answer = await this.call(
			"Runtime.evaluate",
			{ expression, awaitPromise: true, returnByValue: true },
			timeoutMs,
		);
		if (isJsonRecord(answer["exceptionDetails"])) {
			const details = answer["exceptionDetails"];
			const exception = isJsonRecord(details["exception"]) ? details["exception"] : undefined;
			throw new Error(
				typeof exception?.["description"] === "string"
					? exception["description"]
					: `Renderer page evaluation failed: ${JSON.stringify(details)}`,
			);
		}
		return isJsonRecord(answer["result"]) ? answer["result"]["value"] : undefined;
	}

	/**
	 * The last console, exception, network and log events the page produced,
	 * which is what a failed render reports.
	 * @returns The events.
	 */
	diagnostics(): readonly JsonRecord[] {
		return this.#events
			.filter((event) =>
				[
					"Runtime.consoleAPICalled",
					"Runtime.exceptionThrown",
					"Network.loadingFailed",
					"Log.entryAdded",
				].includes(event.method),
			)
			.slice(-20)
			.map((event) => ({ method: event.method, params: event.params }));
	}

	/** Close the connection, failing every call still waiting on it. */
	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.rejectPending("Renderer DevTools connection closed during shutdown.");
		this.socket.close();
	}

	/**
	 * Take one frame: an answer to a call, or an event to remember.
	 * @param raw The frame.
	 */
	private onMessage(raw: string): void {
		let message: unknown;
		try {
			message = JSON.parse(raw) as unknown;
		} catch {
			this.rejectPending("Renderer DevTools returned invalid JSON.");
			return;
		}
		if (!isJsonRecord(message)) {
			return;
		}
		const id = message["id"];
		if (typeof id === "number") {
			this.settleCall(id, message);
			return;
		}
		if (typeof message["method"] === "string") {
			this.#events.push({
				method: message["method"],
				params: isJsonRecord(message["params"]) ? message["params"] : {},
			});
		}
	}

	/**
	 * Settle the call one answer belongs to.
	 * @param id The call.
	 * @param message The answer.
	 */
	private settleCall(id: number, message: JsonRecord): void {
		const pending = this.#pending.get(id);
		if (!pending) {
			return;
		}
		this.#pending.delete(id);
		clearTimeout(pending.timeout);
		const failure = message["error"];
		if (isJsonRecord(failure)) {
			pending.reject(
				new Error(
					typeof failure["message"] === "string" ? failure["message"] : "DevTools command failed.",
				),
			);
			return;
		}
		pending.resolve(isJsonRecord(message["result"]) ? message["result"] : {});
	}

	/**
	 * Fail every call still waiting, because the connection cannot answer them.
	 * @param message Why.
	 */
	private rejectPending(message: string): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error(message));
		}
		this.#pending.clear();
	}
}

export { Cdp };
export type { CdpEvent };
