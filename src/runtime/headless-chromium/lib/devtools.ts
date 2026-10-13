// One DevTools connection to one Chromium target, over Chromium's own
// WebSocket protocol. Nothing here knows what the page is for: it sends one
// method at a time, matches the answer by id, hands every event to whoever
// listens for it, and keeps only the last few complaints the page made so a
// failure can say what the page said. A connection that stays open for a
// whole recording must not grow with it, so nothing else is kept.

import { writeFileSync } from "node:fs";
import { HEADLESS_CHROMIUM_CALL_MS } from "@/shared/timing/timing";

import { HeadlessChromiumError } from "@/runtime/headless-chromium/lib/errors";

/** A JSON object, which is what every DevTools frame is. */
type JsonRecord = Record<string, unknown>;

/** Who hears one event: its parameters. */
type DevToolsListener = (params: JsonRecord) => void;

/** How one expression is evaluated on the page. */
interface EvaluateOptions {
	/** Evaluate as if the user had just acted, which starting a page's audio requires. */
	readonly userGesture?: boolean;
	/** Wait for a promise to settle and answer what it settled to. Default true. */
	readonly awaitPromise?: boolean;
	/**
	 * Answer the value itself. Default true. False answers Chromium's remote
	 * object, whose `objectId` names it to later calls such as readBlobTo.
	 */
	readonly returnByValue?: boolean;
	/** How long to wait for the answer. */
	readonly timeoutMs?: number;
}

/** The events a failure quotes: what the page complained about. */
const DIAGNOSTIC_METHODS: ReadonlySet<string> = new Set([
	"Runtime.consoleAPICalled",
	"Runtime.exceptionThrown",
	"Network.loadingFailed",
	"Log.entryAdded",
]);

/** How many of the page's complaints a connection keeps for a failure to quote. */
const DIAGNOSTIC_TAIL = 20;

/** How many bytes of a Blob one IO.read asks for. */
const BLOB_READ_BYTES = 1024 * 1024;

/**
 * Whether a value is a JSON object.
 * @param value The value.
 * @returns Whether it is a plain record.
 */
function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A failure of a started Chromium.
 * @param message What went wrong.
 * @returns The failure.
 */
function failed(message: string): HeadlessChromiumError {
	return new HeadlessChromiumError("failed", message);
}

/**
 * The failure a page exception is reported as.
 * @param details Chromium's exception details.
 * @returns The failure.
 */
function pageException(details: JsonRecord): HeadlessChromiumError {
	const exception = isJsonRecord(details["exception"]) ? details["exception"] : undefined;
	return failed(
		typeof exception?.["description"] === "string"
			? exception["description"]
			: `Chromium page evaluation failed: ${JSON.stringify(details)}`,
	);
}

/**
 * What Runtime.evaluate is asked, with every option's default settled.
 * @param expression The expression.
 * @param options How to evaluate it.
 * @returns The parameters.
 */
function evaluationParams(expression: string, options: EvaluateOptions) {
	return {
		expression,
		awaitPromise: options.awaitPromise ?? true,
		returnByValue: options.returnByValue ?? true,
		userGesture: options.userGesture ?? false,
	};
}

/**
 * The bytes one IO.read answered.
 * @param chunk The answer.
 * @returns The bytes.
 */
function chunkBytes(chunk: JsonRecord): Buffer {
	const data = typeof chunk["data"] === "string" ? chunk["data"] : "";
	return Buffer.from(data, chunk["base64Encoded"] === true ? "base64" : "utf8");
}

/**
 * Wait for a socket to open, or fail when it cannot, the deadline passes or
 * the caller cancels.
 * @param socket The opening socket.
 * @param timeoutMs How long to wait.
 * @param signal Cancels the wait.
 */
async function opened(socket: WebSocket, timeoutMs: number, signal?: AbortSignal): Promise<void> {
	let timeout: Timer | undefined;
	let cancel: (() => void) | undefined;
	try {
		await new Promise<void>((resolveConnection, rejectConnection) => {
			/** Reject the opening connection on cancellation. */
			cancel = () => {
				rejectConnection(signal?.reason);
			};
			signal?.addEventListener("abort", cancel, { once: true });
			timeout = setTimeout(
				() => rejectConnection(failed("Chromium DevTools socket did not open.")),
				timeoutMs,
			);
			socket.addEventListener("open", () => resolveConnection(), { once: true });
			socket.addEventListener(
				"error",
				() => rejectConnection(failed("Chromium DevTools socket could not open.")),
				{ once: true },
			);
			socket.addEventListener(
				"close",
				() => rejectConnection(failed("Chromium DevTools socket closed before opening.")),
				{ once: true },
			);
		});
	} finally {
		clearTimeout(timeout);
		if (cancel) signal?.removeEventListener("abort", cancel);
	}
}

/** One DevTools connection to one target. */
class DevTools {
	readonly #pending = new Map<
		number,
		{ resolve(value: JsonRecord): void; reject(reason: Error): void; timeout: Timer }
	>();
	readonly #listeners = new Map<string, Set<DevToolsListener>>();
	readonly #diagnostics: { readonly method: string; readonly params: JsonRecord }[] = [];
	#nextId = 1;
	#closed = false;

	/**
	 * A connection is opened through connect, which owns the socket's own
	 * failure to open.
	 * @param socket The open DevTools socket.
	 */
	private constructor(readonly socket: WebSocket) {
		socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
		socket.addEventListener("error", () => this.rejectPending("Chromium DevTools socket failed."));
		socket.addEventListener("close", () => this.rejectPending("Chromium DevTools socket closed."));
	}

	/**
	 * Open a DevTools connection to one target.
	 * @param url The target's socket URL.
	 * @param timeoutMs How long to wait for it to open.
	 * @param signal Cancels opening it.
	 * @returns The connection.
	 */
	static async connect(url: string, timeoutMs: number, signal?: AbortSignal): Promise<DevTools> {
		signal?.throwIfAborted();
		const socket = new WebSocket(url);
		try {
			await opened(socket, timeoutMs, signal);
			signal?.throwIfAborted();
			return new DevTools(socket);
		} catch (error) {
			socket.close();
			throw error;
		}
	}

	/**
	 * Call one DevTools method and wait for its answer.
	 * @param method The method.
	 * @param params Its parameters.
	 * @param timeoutMs How long to wait.
	 * @param signal Stops waiting for the answer.
	 * @returns The result.
	 */
	async call(
		method: string,
		params: JsonRecord = {},
		timeoutMs: number = HEADLESS_CHROMIUM_CALL_MS,
		signal?: AbortSignal,
	): Promise<JsonRecord> {
		if (this.#closed) {
			throw failed("Chromium DevTools connection is closed.");
		}
		signal?.throwIfAborted();
		const id = this.#nextId++;
		const release = this.rejectOnAbort(id, signal);
		try {
			return await new Promise<JsonRecord>((resolveCall, rejectCall) => {
				const timeout = setTimeout(() => {
					this.#pending.delete(id);
					rejectCall(failed(`Chromium DevTools ${method} timed out after ${timeoutMs} ms.`));
				}, timeoutMs);
				this.#pending.set(id, { resolve: resolveCall, reject: rejectCall, timeout });
				this.socket.send(JSON.stringify({ id, method, params }));
			});
		} finally {
			release();
		}
	}

	/**
	 * Fail one pending call when its caller cancels it. The call is forgotten,
	 * so a late answer finds nothing pending.
	 * @param id The call.
	 * @param signal Cancels it.
	 * @returns What stops listening once the call has settled.
	 */
	private rejectOnAbort(id: number, signal?: AbortSignal): () => void {
		if (signal === undefined) return () => undefined;
		/** Forget the call and fail it with the caller's reason. */
		const cancel = (): void => {
			const pending = this.#pending.get(id);
			if (!pending) return;
			this.#pending.delete(id);
			clearTimeout(pending.timeout);
			const reason: unknown = signal.reason;
			pending.reject(reason instanceof Error ? reason : new Error(String(reason)));
		};
		signal.addEventListener("abort", cancel, { once: true });
		return () => signal.removeEventListener("abort", cancel);
	}

	/**
	 * Evaluate one expression on the page, turning a page exception into a
	 * failure here.
	 * @param expression The expression.
	 * @param options How to evaluate it.
	 * @returns The value, or the remote object when `returnByValue` is false.
	 */
	async evaluate(expression: string, options: EvaluateOptions = {}): Promise<unknown> {
		const params = evaluationParams(expression, options);
		const answer = await this.call("Runtime.evaluate", params, options.timeoutMs);
		if (isJsonRecord(answer["exceptionDetails"])) throw pageException(answer["exceptionDetails"]);
		const result = isJsonRecord(answer["result"]) ? answer["result"] : undefined;
		return params.returnByValue ? result?.["value"] : result;
	}

	/**
	 * Hear every event of one method from now on.
	 * @param method The event, such as `Page.screencastFrame`.
	 * @param listener Who hears it.
	 * @returns What stops it hearing.
	 */
	on(method: string, listener: DevToolsListener): () => void {
		const listeners = this.#listeners.get(method) ?? new Set<DevToolsListener>();
		/**
		 * This subscription, apart from any other of the same listener, which
		 * hears each event once per subscription.
		 * @param params The event's parameters.
		 */
		const subscription: DevToolsListener = (params) => {
			listener(params);
		};
		listeners.add(subscription);
		this.#listeners.set(method, listeners);
		/** Stop hearing the event. */
		return () => {
			listeners.delete(subscription);
			if (listeners.size === 0 && this.#listeners.get(method) === listeners) {
				this.#listeners.delete(method);
			}
		};
	}

	/**
	 * The last console, exception, network and log events the page produced,
	 * which is what a failure reports.
	 * @returns The events, oldest first.
	 */
	diagnostics(): readonly JsonRecord[] {
		return this.#diagnostics.map((event) => ({ method: event.method, params: event.params }));
	}

	/**
	 * Stream one page Blob into a file as it is read, never holding it whole.
	 * The caller owns atomicity: it names a temporary path and renames it.
	 * @param objectId The Blob's remote object, from evaluate with `returnByValue` false.
	 * @param path The file to write.
	 * @param timeoutMs How long each DevTools read may take.
	 * @returns How many bytes were written.
	 */
	async readBlobTo(objectId: string, path: string, timeoutMs: number): Promise<{ bytes: number }> {
		const resolved = await this.call("IO.resolveBlob", { objectId }, timeoutMs);
		if (typeof resolved["uuid"] !== "string") {
			throw failed("Chromium did not resolve the object to a Blob.");
		}
		const handle = `blob:${resolved["uuid"]}`;
		// A writer does not truncate: a file already longer than the Blob would keep its tail.
		writeFileSync(path, "");
		const sink = Bun.file(path).writer();
		try {
			return { bytes: await this.pump(handle, sink, timeoutMs) };
		} finally {
			await sink.end();
			// The stream is read or abandoned either way; a close that fails
			// leaves nothing the caller could act on.
			await this.call("IO.close", { handle }, timeoutMs).catch(() => undefined);
		}
	}

	/** Close the connection, failing every call still waiting on it. */
	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#listeners.clear();
		this.rejectPending("Chromium DevTools connection closed during shutdown.");
		this.socket.close();
	}

	/**
	 * Read one stream to its end into a sink.
	 * @param handle The stream.
	 * @param sink Where its bytes go.
	 * @param timeoutMs How long each read may take.
	 * @returns How many bytes it held.
	 */
	private async pump(handle: string, sink: Bun.FileSink, timeoutMs: number): Promise<number> {
		let bytes = 0;
		for (;;) {
			// oxlint-disable-next-line no-await-in-loop -- a stream is read in order: each read continues where the last ended
			const chunk = await this.call("IO.read", { handle, size: BLOB_READ_BYTES }, timeoutMs);
			const data = chunkBytes(chunk);
			// oxlint-disable-next-line no-await-in-loop -- each chunk reaches the file before the next is read, so memory stays one chunk
			await sink.write(data);
			// oxlint-disable-next-line no-await-in-loop -- as above: the chunk is on disk before the next read
			await sink.flush();
			bytes += data.length;
			if (chunk["eof"] === true) return bytes;
		}
	}

	/**
	 * Take one frame: an answer to a call, or an event for whoever listens.
	 * @param raw The frame.
	 */
	private onMessage(raw: string): void {
		let message: unknown;
		try {
			message = JSON.parse(raw) as unknown;
		} catch {
			this.rejectPending("Chromium DevTools returned invalid JSON.");
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
			this.dispatch(message["method"], isJsonRecord(message["params"]) ? message["params"] : {});
		}
	}

	/**
	 * Hand one event to its listeners, and keep it when it is a complaint a
	 * failure would quote.
	 * @param method The event.
	 * @param params Its parameters.
	 */
	private dispatch(method: string, params: JsonRecord): void {
		if (DIAGNOSTIC_METHODS.has(method)) {
			this.#diagnostics.push({ method, params });
			if (this.#diagnostics.length > DIAGNOSTIC_TAIL) this.#diagnostics.shift();
		}
		// A set may lose members while it is iterated, so a listener may unsubscribe as it hears.
		for (const listener of this.#listeners.get(method) ?? []) listener(params);
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
				failed(
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
			pending.reject(failed(message));
		}
		this.#pending.clear();
	}
}

export { DevTools, isJsonRecord, type DevToolsListener, type EvaluateOptions, type JsonRecord };
