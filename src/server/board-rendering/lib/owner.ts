import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { processIdentity, type ProcessIdentity } from "../../../runtime/engine/process-group.js";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "../../../runtime/codex-process/process-group.js";
import {
	BOARD_RENDER_CLEANUP_MS,
	BOARD_RENDER_JOB_TIMEOUT_MS,
	BOARD_RENDER_STARTUP_TIMEOUT_MS,
} from "../../../shared/timing/timing.js";
import type { BoardRendererJob, BoardRendererJobResult, RendererPageState } from "./contract.js";
import {
	createRendererFixture,
	type RendererFixture,
	type RendererFixtureTestHooks,
} from "./fixture.js";

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const processGroups = createCodexProcessGroupOperations();
// Chromium adds two long singleton-directory segments below TMPDIR. Keep the
// owned root short enough for Linux's Unix-socket path limit even when the
// canvas itself inherited a deeply nested test or launcher TMPDIR.
const rendererTempParent = process.platform === "linux" ? "/tmp" : tmpdir();

export interface BoardRenderingOwnerOptions {
	readonly chromiumPath?: string;
	readonly setsidPath?: string;
	readonly jobTimeoutMs?: number;
	readonly startupTimeoutMs?: number;
	readonly cleanupTimeoutMs?: number;
	/** Deterministic fault and scheduling controls used only by the focused owner test. */
	readonly testHooks?: BoardRenderingOwnerTestHooks;
}

export interface BoardRenderingOwnerTestHooks extends RendererFixtureTestHooks {
	beforeRun?(job: BoardRendererJob, signal?: AbortSignal): Promise<void> | void;
	afterCdpDispatch?(job: BoardRendererJob, pid: number): void;
	adjustSessionCleanup?(cleanup: RendererSessionCleanup): RendererSessionCleanup;
	onTempRoot?(root: string): void;
	onChromiumStart?(pid: number): void;
}

type ResolvedOwnerOptions = Required<Omit<BoardRenderingOwnerOptions, "testHooks">> & {
	readonly testHooks: BoardRenderingOwnerTestHooks;
};

export interface BoardRenderingOwnerStatus {
	readonly started: boolean;
	readonly accepting: boolean;
	readonly active: boolean;
	readonly queued: number;
	readonly chromiumStarts: number;
	readonly chromiumPid: number | null;
	readonly tempRoot: string | null;
	readonly profile: string | null;
	readonly controlPort: number | null;
	readonly fixturePort: number | null;
}

export interface RendererSessionCleanup {
	readonly clean: boolean;
	readonly pids: readonly number[];
	readonly processesGone: boolean;
	readonly survivors: readonly number[];
	readonly groupAbsent: boolean;
	readonly leaderSettled: boolean;
	readonly stdoutSettled: boolean;
	readonly stderrSettled: boolean;
	readonly profileRemoved: boolean;
	readonly tempRootRemoved: boolean;
	readonly portReleased: boolean;
	readonly errors: readonly string[];
}

export interface BoardRendererCleanup extends RendererSessionCleanup {
	readonly fixtureClosed: boolean;
}

export class BoardRendererError extends Error {
	readonly code = "BOARD_RENDERER_FAILED";

	constructor(
		message: string,
		readonly phase: string,
		readonly diagnostics: readonly JsonRecord[] = [],
		cause?: unknown,
	) {
		const causeMessage =
			cause instanceof Error
				? ` Cause: ${cause.message}`
				: cause === undefined
					? ""
					: ` Cause: ${String(cause)}`;
		super(
			`${message} Renderer phase: ${phase}.${
				diagnostics.length > 0 ? ` Diagnostics: ${JSON.stringify(diagnostics.slice(-12))}.` : ""
			}${causeMessage}`,
			cause === undefined ? undefined : { cause },
		);
		this.name = "BoardRendererError";
	}
}

interface CdpEvent {
	readonly method: string;
	readonly params: JsonRecord;
}

class Cdp {
	readonly #pending = new Map<
		number,
		{ resolve(value: JsonRecord): void; reject(reason: Error): void; timeout: Timer }
	>();
	readonly #events: CdpEvent[] = [];
	#nextId = 1;
	#closed = false;

	private constructor(readonly socket: WebSocket) {
		socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
		socket.addEventListener("error", () => this.rejectPending("Renderer DevTools socket failed."));
		socket.addEventListener("close", () => this.rejectPending("Renderer DevTools socket closed."));
	}

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

	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.rejectPending("Renderer DevTools connection closed during shutdown.");
		this.socket.close();
	}

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
			const pending = this.#pending.get(id);
			if (!pending) {
				return;
			}
			this.#pending.delete(id);
			clearTimeout(pending.timeout);
			if (isJsonRecord(message["error"])) {
				pending.reject(
					new Error(
						typeof message["error"]["message"] === "string"
							? message["error"]["message"]
							: "DevTools command failed.",
					),
				);
			} else {
				pending.resolve(isJsonRecord(message["result"]) ? message["result"] : {});
			}
			return;
		}
		if (typeof message["method"] === "string") {
			this.#events.push({
				method: message["method"],
				params: isJsonRecord(message["params"]) ? message["params"] : {},
			});
		}
	}

	private rejectPending(message: string): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error(message));
		}
		this.#pending.clear();
	}
}

function requiredExecutable(name: string, explicit?: string): string {
	const candidate = explicit ?? Bun.which(name);
	if (!candidate || !existsSync(candidate)) {
		throw new BoardRendererError(
			`Board rendering requires the local ${name} executable. Install it or set the renderer path before starting Archboard.`,
			"preflight",
		);
	}
	return candidate;
}

async function reserveLoopbackPort(): Promise<number> {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response("reserved"),
	});
	const port = server.port;
	await server.stop(true);
	if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0) {
		throw new Error("Board renderer could not reserve a loopback control port.");
	}
	return port;
}

async function loopbackPortIsAvailable(port: number | null): Promise<boolean> {
	if (port === null) {
		return true;
	}
	let server: ReturnType<typeof Bun.serve> | null = null;
	try {
		server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("audit") });
		return true;
	} catch {
		return false;
	} finally {
		if (server) {
			await server.stop(true);
		}
	}
}

function readablePipe(
	stream: ReadableStream<Uint8Array> | number | undefined,
): ReadableStream<Uint8Array> {
	if (!stream || typeof stream === "number") {
		throw new Error("Renderer child has no output pipe.");
	}
	return stream;
}

interface CapturedPipe {
	readonly settled: Promise<void>;
	tail(): string;
	error(): string | null;
}

const OUTPUT_TAIL_CHARACTERS = 8_192;

function capturePipe(stream: ReadableStream<Uint8Array>): CapturedPipe {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let output = "";
	let failure: string | null = null;
	const append = (chunk: string): void => {
		output = (output + chunk).slice(-OUTPUT_TAIL_CHARACTERS);
	};
	const settled = (async () => {
		try {
			for (;;) {
				const next = await reader.read();
				if (next.done) {
					break;
				}
				append(decoder.decode(next.value, { stream: true }));
			}
			append(decoder.decode());
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	})();
	return Object.freeze({
		settled,
		tail: () => output,
		error: () => failure,
	});
}

function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new Error(
				signal.reason === undefined ? "Board renderer work was canceled." : String(signal.reason),
			);
}

async function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) {
		return await work;
	}
	signal.throwIfAborted();
	let cancel!: (reason: Error) => void;
	const canceled = new Promise<never>((_resolve, reject) => {
		cancel = reject;
	});
	const onAbort = (): void => cancel(abortReason(signal));
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		return await Promise.race([work, canceled]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}

async function settlesBefore(promise: Promise<unknown>, deadline: number): Promise<boolean> {
	return await Promise.race([
		promise.then(
			() => true,
			() => true,
		),
		Bun.sleep(Math.max(0, deadline - Date.now())).then(() => false),
	]);
}

async function waitForGroupAbsence(
	identity: CodexProcessGroupIdentity,
	deadline: number,
): Promise<boolean> {
	while (Date.now() < deadline) {
		const state = processGroups.inspect(identity);
		if (state === "quiescent") {
			return true;
		}
		if (state === "reused" || state === "unproven") {
			return false;
		}
		await Bun.sleep(Math.min(25, Math.max(0, deadline - Date.now())));
	}
	return processGroups.inspect(identity) === "quiescent";
}

function rawProcessGroupAbsent(groupId: number): boolean {
	try {
		process.kill(-groupId, 0);
		return false;
	} catch (error) {
		if (isJsonRecord(error) && error["code"] === "ESRCH") {
			return true;
		}
		throw error;
	}
}

async function captureGroup(
	candidate: ProcessIdentity,
	deadline: number,
): Promise<CodexProcessGroupIdentity> {
	let failure: unknown = null;
	while (Date.now() < deadline) {
		try {
			const group = processGroups.capture(candidate.pid);
			if (group.leaderStartTime !== candidate.startTime) {
				throw new Error("Renderer process identity changed before group capture.");
			}
			return group;
		} catch (error) {
			failure = error;
			await Bun.sleep(Math.min(25, Math.max(0, deadline - Date.now())));
		}
	}
	throw new Error(
		`Renderer process ${candidate.pid} did not establish its dedicated group: ${
			failure instanceof Error ? failure.message : String(failure)
		}.`,
		{ cause: failure },
	);
}

function ownedProcessIds(pid: number): number[] {
	const seen = new Set<number>();
	const visit = (candidate: number): void => {
		if (seen.has(candidate) || !existsSync(`/proc/${candidate}`)) {
			return;
		}
		seen.add(candidate);
		try {
			for (const child of readFileSync(`/proc/${candidate}/task/${candidate}/children`, "utf8")
				.trim()
				.split(/\s+/)) {
				const parsed = Number(child);
				if (Number.isInteger(parsed) && parsed > 0) {
					visit(parsed);
				}
			}
		} catch {
			// A child can exit between the directory check and the process-tree read.
		}
	};
	visit(pid);
	return [...seen].toSorted((left, right) => left - right);
}

function isRendererJobResult(value: unknown): value is BoardRendererJobResult {
	if (!isJsonRecord(value)) {
		return false;
	}
	const kind = Reflect.get(value, "kind");
	const error = Reflect.get(value, "error");
	if (error !== undefined && typeof error !== "string") {
		return false;
	}
	if (kind === "mermaid") {
		const elements = Reflect.get(value, "elements");
		const files = Reflect.get(value, "files");
		return (
			Array.isArray(elements) &&
			elements.every(
				(element) => isJsonRecord(element) && typeof Reflect.get(element, "type") === "string",
			) &&
			isJsonRecord(files) &&
			Object.values(files).every(
				(file) =>
					isJsonRecord(file) &&
					typeof file["id"] === "string" &&
					typeof file["dataURL"] === "string" &&
					typeof file["mimeType"] === "string" &&
					typeof file["created"] === "number",
			)
		);
	}
	if (kind !== "render") {
		return false;
	}
	const outputs = Reflect.get(value, "outputs");
	return (
		Array.isArray(outputs) &&
		outputs.every(
			(output) =>
				output !== null &&
				typeof output === "object" &&
				typeof Reflect.get(output, "id") === "string" &&
				["png", "svg"].includes(String(Reflect.get(output, "format"))) &&
				typeof Reflect.get(output, "data") === "string" &&
				typeof Reflect.get(output, "width") === "number" &&
				typeof Reflect.get(output, "height") === "number",
		)
	);
}

function isRendererPageState(value: unknown): value is RendererPageState {
	return (
		isJsonRecord(value) &&
		typeof value["phase"] === "string" &&
		typeof value["active"] === "boolean" &&
		typeof value["jobs"] === "number"
	);
}

class RendererSession {
	#tempRoot: string | null = null;
	#profile: string | null = null;
	#port: number | null = null;
	#child: Bun.Subprocess | null = null;
	#candidate: ProcessIdentity | null = null;
	#group: CodexProcessGroupIdentity | null = null;
	#stdout: CapturedPipe | null = null;
	#stderr: CapturedPipe | null = null;
	#cdp: Cdp | null = null;
	#closePromise: Promise<RendererSessionCleanup> | null = null;
	readonly #observed = new Set<number>();

	private constructor(readonly options: ResolvedOwnerOptions) {}

	get pid(): number | null {
		return this.#child?.pid ?? null;
	}

	get profile(): string | null {
		return this.#profile;
	}

	get tempRoot(): string | null {
		return this.#tempRoot;
	}

	get port(): number | null {
		return this.#port;
	}

	static async acquire(url: string, options: ResolvedOwnerOptions): Promise<RendererSession> {
		const session = new RendererSession(options);
		try {
			const chromiumPath = requiredExecutable("chromium", options.chromiumPath || undefined);
			const setsidPath = requiredExecutable("setsid", options.setsidPath || undefined);
			session.#tempRoot = mkdtempSync(join(rendererTempParent, "archboard-board-renderer-"));
			options.testHooks.onTempRoot?.(session.#tempRoot);
			session.#profile = join(session.#tempRoot, "profile");
			mkdirSync(session.#profile, { mode: 0o700 });
			session.#port = await reserveLoopbackPort();
			session.#child = Bun.spawn({
				cmd: [
					setsidPath,
					chromiumPath,
					"--headless=new",
					"--disable-gpu",
					"--no-first-run",
					"--no-default-browser-check",
					"--disable-crash-reporter",
					`--user-data-dir=${session.#profile}`,
					`--remote-debugging-port=${session.#port}`,
					"about:blank",
				],
				cwd: repositoryRoot,
				env: { ...process.env, TMPDIR: session.#tempRoot },
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});
			session.#stdout = capturePipe(readablePipe(session.#child.stdout));
			session.#stderr = capturePipe(readablePipe(session.#child.stderr));
			options.testHooks.onChromiumStart?.(session.#child.pid);
			session.#candidate = processIdentity(session.#child.pid);
			session.observe();
			session.#group = await captureGroup(
				session.#candidate,
				Date.now() + options.cleanupTimeoutMs,
			);
			await session.connect(url);
			return session;
		} catch (error) {
			const cleanup = await session.close();
			const diagnostics = session.processDiagnostics();
			const acquisition = new BoardRendererError(
				"Board renderer could not start.",
				"startup",
				diagnostics,
				error,
			);
			if (!cleanup.clean) {
				throw new BoardRendererError(
					"Board renderer startup and cleanup failed.",
					"startup-cleanup",
					[...diagnostics, { cleanup }],
					acquisition,
				);
			}
			throw acquisition;
		}
	}

	async run(job: BoardRendererJob, signal?: AbortSignal): Promise<BoardRendererJobResult> {
		const cdp = this.#cdp;
		if (!cdp || !this.#child) {
			throw new BoardRendererError("Board renderer is not ready.", "startup");
		}
		if (this.#child.exitCode !== null) {
			throw new BoardRendererError(
				`Board renderer Chromium exited with code ${this.#child.exitCode}.`,
				"process-exit",
				cdp.diagnostics(),
			);
		}
		try {
			const evaluation = cdp.evaluate(
				`window.archboardBoardRenderer?.run(${JSON.stringify(job)})`,
				this.options.jobTimeoutMs,
			);
			this.options.testHooks.afterCdpDispatch?.(job, this.#child.pid);
			const value = await abortable(evaluation, signal);
			signal?.throwIfAborted();
			if (!isRendererJobResult(value)) {
				throw new Error("Renderer page returned no structured result.");
			}
			return value;
		} catch (error) {
			if (signal?.aborted) {
				throw abortReason(signal);
			}
			const phase = await this.pageState().catch(() => null);
			throw new BoardRendererError(
				"Board renderer job failed.",
				phase?.phase ?? "unavailable",
				cdp.diagnostics(),
				error,
			);
		}
	}

	close(): Promise<RendererSessionCleanup> {
		if (this.#closePromise) {
			return this.#closePromise;
		}
		this.#closePromise = this.closeOnce();
		return this.#closePromise;
	}

	private async connect(url: string): Promise<void> {
		if (!this.#child || this.#port === null) {
			throw new Error("Renderer process is incomplete.");
		}
		const base = `http://127.0.0.1:${this.#port}`;
		const deadline = Date.now() + this.options.startupTimeoutMs;
		while (Date.now() < deadline) {
			if (this.#child.exitCode !== null) {
				throw new Error(`Chromium exited during startup with code ${this.#child.exitCode}.`);
			}
			try {
				if ((await fetch(`${base}/json/version`)).ok) {
					break;
				}
			} catch {
				// Chromium has not bound the private loopback control port yet.
			}
			await Bun.sleep(25);
		}
		let version: Response;
		try {
			version = await fetch(`${base}/json/version`);
		} catch (error) {
			throw new Error("Chromium did not bind its private control port.", { cause: error });
		}
		if (!version.ok) {
			throw new Error("Chromium did not bind its private control port.");
		}
		const target = (await (
			await fetch(`${base}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
		).json()) as { webSocketDebuggerUrl?: unknown };
		if (typeof target.webSocketDebuggerUrl !== "string") {
			throw new Error("Chromium did not create the private renderer target.");
		}
		this.#cdp = await Cdp.connect(target.webSocketDebuggerUrl, this.options.startupTimeoutMs);
		for (const domain of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"]) {
			await this.#cdp.call(domain, {}, this.options.startupTimeoutMs);
		}
		await this.#cdp.call("Page.navigate", { url }, this.options.startupTimeoutMs);
		while (Date.now() < deadline) {
			const state = await this.pageState().catch(() => null);
			if (state?.phase === "ready") {
				return;
			}
			await Bun.sleep(25);
		}
		throw new Error("Renderer page did not become ready before its startup deadline.");
	}

	private async pageState(): Promise<RendererPageState | null> {
		if (!this.#cdp) {
			return null;
		}
		const value = await this.#cdp.evaluate(
			"window.archboardBoardRenderer?.state ?? null",
			this.options.startupTimeoutMs,
		);
		return isRendererPageState(value) ? value : null;
	}

	private async closeOnce(): Promise<RendererSessionCleanup> {
		const errors: string[] = [];
		this.#cdp?.close();
		this.observe();
		const pids = [...this.#observed].toSorted((left, right) => left - right);
		let group = this.#group;
		const deadline = Date.now() + this.options.cleanupTimeoutMs;
		if (!group && this.#candidate) {
			try {
				group = await captureGroup(this.#candidate, deadline);
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}
		let groupAbsent = this.#child === null;
		if (group) {
			try {
				if (processGroups.inspect(group) === "owned") {
					processGroups.signal(group, "SIGTERM");
				}
				groupAbsent = await waitForGroupAbsence(
					group,
					Date.now() + Math.max(0, this.options.cleanupTimeoutMs - 1_000),
				);
				if (!groupAbsent && processGroups.inspect(group) === "owned") {
					processGroups.signal(group, "SIGKILL");
					groupAbsent = await waitForGroupAbsence(group, deadline);
				}
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		} else if (this.#child && this.#child.exitCode === null) {
			errors.push("Renderer process group could not be proved during cleanup.");
			this.#child.kill("SIGKILL");
		} else if (this.#child) {
			try {
				groupAbsent = rawProcessGroupAbsent(this.#child.pid);
				if (!groupAbsent) {
					errors.push(
						`Renderer process group ${this.#child.pid} survived after its leader exited before capture.`,
					);
				}
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}
		const [leaderSettled, stdoutSettled, stderrSettled] = await Promise.all([
			this.#child ? settlesBefore(this.#child.exited, deadline) : Promise.resolve(true),
			this.#stdout ? settlesBefore(this.#stdout.settled, deadline) : Promise.resolve(true),
			this.#stderr ? settlesBefore(this.#stderr.settled, deadline) : Promise.resolve(true),
		]);
		for (const [name, pipe] of [
			["stdout", this.#stdout],
			["stderr", this.#stderr],
		] as const) {
			const failure = pipe?.error();
			if (failure) {
				errors.push(`Renderer ${name} pipe failed: ${failure}`);
			}
		}
		let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		while (survivors.length > 0 && Date.now() < deadline) {
			await Bun.sleep(Math.min(25, Math.max(0, deadline - Date.now())));
			survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		}
		const processesGone = survivors.length === 0;
		if (
			groupAbsent &&
			processesGone &&
			leaderSettled &&
			stdoutSettled &&
			stderrSettled &&
			this.#tempRoot
		) {
			try {
				rmSync(this.#tempRoot, { recursive: true, force: true });
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}
		const profileRemoved = !this.#profile || !existsSync(this.#profile);
		const tempRootRemoved = !this.#tempRoot || !existsSync(this.#tempRoot);
		const portReleased = await loopbackPortIsAvailable(this.#port);
		const clean =
			groupAbsent &&
			processesGone &&
			leaderSettled &&
			stdoutSettled &&
			stderrSettled &&
			profileRemoved &&
			tempRootRemoved &&
			portReleased &&
			errors.length === 0;
		const cleanup: RendererSessionCleanup = {
			clean,
			pids,
			processesGone,
			survivors,
			groupAbsent,
			leaderSettled,
			stdoutSettled,
			stderrSettled,
			profileRemoved,
			tempRootRemoved,
			portReleased,
			errors,
		};
		return this.options.testHooks.adjustSessionCleanup?.(cleanup) ?? cleanup;
	}

	private processDiagnostics(): JsonRecord[] {
		return [
			...(this.#stdout?.tail() ? [{ stream: "stdout", tail: this.#stdout.tail() }] : []),
			...(this.#stderr?.tail() ? [{ stream: "stderr", tail: this.#stderr.tail() }] : []),
		];
	}

	private observe(): void {
		if (!this.#child) {
			return;
		}
		for (const pid of ownedProcessIds(this.#child.pid)) {
			this.#observed.add(pid);
		}
	}
}

export function createBoardRenderingOwner(options: BoardRenderingOwnerOptions = {}) {
	let chromiumStarts = 0;
	const configuredHooks = options.testHooks ?? {};
	const resolved: ResolvedOwnerOptions = {
		chromiumPath:
			options.chromiumPath ??
			process.env["ARCHBOARD_RENDERER_CHROMIUM"] ??
			Bun.which("chromium") ??
			"",
		setsidPath: options.setsidPath ?? Bun.which("setsid") ?? "",
		jobTimeoutMs: options.jobTimeoutMs ?? BOARD_RENDER_JOB_TIMEOUT_MS,
		startupTimeoutMs: options.startupTimeoutMs ?? BOARD_RENDER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: options.cleanupTimeoutMs ?? BOARD_RENDER_CLEANUP_MS,
		testHooks: {
			...configuredHooks,
			onChromiumStart(pid) {
				chromiumStarts += 1;
				configuredHooks.onChromiumStart?.(pid);
			},
		},
	};
	let started = false;
	let accepting = false;
	let stopping = false;
	let active = false;
	let queued = 0;
	let fixture: RendererFixture | null = null;
	let session: RendererSession | null = null;
	let acquisition: Promise<RendererSession> | null = null;
	let tail: Promise<void> = Promise.resolve();
	let stopPromise: Promise<BoardRendererCleanup> | null = null;
	let lastCleanup: BoardRendererCleanup | null = null;

	const start = (): void => {
		if (started) {
			return;
		}
		started = true;
		accepting = true;
	};

	const acquire = async (): Promise<RendererSession> => {
		if (session) {
			return session;
		}
		if (acquisition) {
			return acquisition;
		}
		acquisition = (async () => {
			if (!fixture) {
				try {
					fixture = await createRendererFixture(resolved.testHooks);
				} catch (error) {
					throw new BoardRendererError(
						"Board renderer fixture could not start.",
						"fixture-startup",
						[],
						error,
					);
				}
			}
			if (stopping) {
				throw new Error("Board renderer stopped during startup.");
			}
			const acquired = await RendererSession.acquire(fixture.url, resolved);
			if (stopping) {
				await acquired.close();
				throw new Error("Board renderer stopped during startup.");
			}
			session = acquired;
			return acquired;
		})().finally(() => {
			acquisition = null;
		});
		return acquisition;
	};

	const execute = async (
		job: BoardRendererJob,
		signal?: AbortSignal,
	): Promise<BoardRendererJobResult> => {
		if (!started || !accepting) {
			throw new Error("Board renderer is not accepting work.");
		}
		signal?.throwIfAborted();
		queued += 1;
		const state: { value: "queued" | "active" | "settled" } = { value: "queued" };
		let resolveResult!: (result: BoardRendererJobResult) => void;
		let rejectResult!: (error: unknown) => void;
		const result = new Promise<BoardRendererJobResult>((resolveJob, rejectJob) => {
			resolveResult = resolveJob;
			rejectResult = rejectJob;
		});
		const onAbort = (): void => {
			if (state.value !== "queued" || !signal) {
				return;
			}
			state.value = "settled";
			queued -= 1;
			rejectResult(abortReason(signal));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		const before = tail;
		tail = (async () => {
			await before;
			if (state.value === "settled") {
				return undefined;
			}
			queued -= 1;
			state.value = "active";
			if (!accepting) {
				rejectResult(
					new BoardRendererError("Board renderer stopped before queued work began.", "shutdown"),
				);
				state.value = "settled";
				return undefined;
			}
			active = true;
			let enteredRenderer = false;
			try {
				const current = await acquire();
				signal?.throwIfAborted();
				await abortable(Promise.resolve(resolved.testHooks.beforeRun?.(job, signal)), signal);
				signal?.throwIfAborted();
				enteredRenderer = true;
				resolveResult(await current.run(job, signal));
			} catch (error) {
				let failure = error;
				const failed = enteredRenderer ? session : null;
				if (failed) {
					session = null;
				}
				if (failed) {
					const cleanup = await failed.close();
					if (!cleanup.clean) {
						failure = new BoardRendererError(
							"Board renderer job and cleanup failed.",
							error instanceof BoardRendererError ? error.phase : "cleanup",
							[...(error instanceof BoardRendererError ? error.diagnostics : []), { cleanup }],
							error,
						);
					}
				}
				rejectResult(failure);
			} finally {
				active = false;
				state.value = "settled";
				signal?.removeEventListener("abort", onAbort);
			}
			return undefined;
		})();
		return result;
	};

	const stop = (): Promise<BoardRendererCleanup> => {
		if (stopPromise) {
			return stopPromise;
		}
		accepting = false;
		stopping = true;
		stopPromise = (async () => {
			const acquired = await acquisition?.catch(() => null);
			const current = session ?? acquired;
			session = null;
			current?.close();
			await tail;
			let sessionCleanup: RendererSessionCleanup;
			if (current) {
				sessionCleanup = await current.close();
			} else {
				sessionCleanup = {
					clean: true,
					pids: [],
					processesGone: true,
					survivors: [],
					groupAbsent: true,
					leaderSettled: true,
					stdoutSettled: true,
					stderrSettled: true,
					profileRemoved: true,
					tempRootRemoved: true,
					portReleased: true,
					errors: [],
				};
			}
			let fixtureClosed = true;
			const errors = [...sessionCleanup.errors];
			if (fixture) {
				try {
					await fixture.close();
					fixtureClosed = !fixture.listening();
				} catch (error) {
					errors.push(error instanceof Error ? error.message : String(error));
					fixtureClosed = false;
				}
			}
			const cleanup: BoardRendererCleanup = {
				...sessionCleanup,
				fixtureClosed,
				errors,
				clean: sessionCleanup.clean && fixtureClosed && errors.length === 0,
			};
			fixture = null;
			lastCleanup = cleanup;
			if (!cleanup.clean) {
				throw new Error(`Board renderer cleanup failed: ${JSON.stringify(cleanup)}`);
			}
			return cleanup;
		})();
		return stopPromise;
	};

	return Object.freeze({
		start,
		execute,
		stop,
		forceStop: stop,
		status: (): BoardRenderingOwnerStatus => ({
			started,
			accepting,
			active,
			queued,
			chromiumStarts,
			chromiumPid: session?.pid ?? null,
			tempRoot: session?.tempRoot ?? null,
			profile: session?.profile ?? null,
			controlPort: session?.port ?? null,
			fixturePort: fixture?.port ?? null,
		}),
		lastCleanup: (): BoardRendererCleanup | null => lastCleanup,
	});
}
