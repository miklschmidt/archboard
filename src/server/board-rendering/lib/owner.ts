import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createServer, type ViteDevServer } from "vite";

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

type JsonRecord = Record<string, unknown>;

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const rendererPage = "/src/server/board-rendering/lib/renderer.html";
const processGroups = createCodexProcessGroupOperations();

export interface BoardRenderingOwnerOptions {
	readonly chromiumPath?: string;
	readonly setsidPath?: string;
	readonly jobTimeoutMs?: number;
	readonly startupTimeoutMs?: number;
	readonly cleanupTimeoutMs?: number;
}

export interface BoardRenderingOwnerStatus {
	readonly started: boolean;
	readonly accepting: boolean;
	readonly active: boolean;
	readonly queued: number;
	readonly chromiumPid: number | null;
	readonly profile: string | null;
	readonly controlPort: number | null;
}

export interface BoardRendererCleanup {
	readonly clean: boolean;
	readonly pids: readonly number[];
	readonly processesGone: boolean;
	readonly survivors: readonly number[];
	readonly groupAbsent: boolean;
	readonly leaderSettled: boolean;
	readonly stdoutSettled: boolean;
	readonly stderrSettled: boolean;
	readonly profileRemoved: boolean;
	readonly portReleased: boolean;
	readonly fixtureClosed: boolean;
	readonly errors: readonly string[];
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
		if (this.#closed) throw new Error("Renderer DevTools connection is closed.");
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
		if (answer.exceptionDetails) {
			const details = answer.exceptionDetails as JsonRecord;
			const exception = details.exception as JsonRecord | undefined;
			throw new Error(
				typeof exception?.description === "string"
					? exception.description
					: `Renderer page evaluation failed: ${JSON.stringify(details)}`,
			);
		}
		return (answer.result as JsonRecord | undefined)?.value;
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
		if (this.#closed) return;
		this.#closed = true;
		this.rejectPending("Renderer DevTools connection closed during shutdown.");
		this.socket.close();
	}

	private onMessage(raw: string): void {
		const message = JSON.parse(raw) as {
			id?: number;
			result?: JsonRecord;
			error?: { message?: string };
			method?: string;
			params?: JsonRecord;
		};
		if (typeof message.id === "number") {
			const pending = this.#pending.get(message.id);
			if (!pending) return;
			this.#pending.delete(message.id);
			clearTimeout(pending.timeout);
			if (message.error)
				pending.reject(new Error(message.error.message ?? "DevTools command failed."));
			else pending.resolve(message.result ?? {});
			return;
		}
		if (message.method) this.#events.push({ method: message.method, params: message.params ?? {} });
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
	if (!candidate || !existsSync(candidate))
		throw new BoardRendererError(
			`Board rendering requires the local ${name} executable. Install it or set the renderer path before starting Archboard.`,
			"preflight",
		);
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
	if (!Number.isSafeInteger(port) || port <= 0)
		throw new Error("Board renderer could not reserve a loopback control port.");
	return port;
}

async function loopbackPortIsAvailable(port: number | null): Promise<boolean> {
	if (port === null) return true;
	let server: ReturnType<typeof Bun.serve> | null = null;
	try {
		server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("audit") });
		return true;
	} catch {
		return false;
	} finally {
		if (server) await server.stop(true);
	}
}

function readablePipe(
	stream: ReadableStream<Uint8Array> | number | undefined,
): ReadableStream<Uint8Array> {
	if (!stream || typeof stream === "number") throw new Error("Renderer child has no output pipe.");
	return stream;
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
		if (state === "quiescent") return true;
		if (state === "reused" || state === "unproven") return false;
		await Bun.sleep(Math.min(25, Math.max(0, deadline - Date.now())));
	}
	return processGroups.inspect(identity) === "quiescent";
}

async function captureGroup(
	candidate: ProcessIdentity,
	deadline: number,
): Promise<CodexProcessGroupIdentity> {
	let failure: unknown = null;
	while (Date.now() < deadline) {
		try {
			const group = processGroups.capture(candidate.pid);
			if (group.leaderStartTime !== candidate.startTime)
				throw new Error("Renderer process identity changed before group capture.");
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
		if (seen.has(candidate) || !existsSync(`/proc/${candidate}`)) return;
		seen.add(candidate);
		try {
			for (const child of readFileSync(`/proc/${candidate}/task/${candidate}/children`, "utf8")
				.trim()
				.split(/\s+/)) {
				const parsed = Number(child);
				if (Number.isInteger(parsed) && parsed > 0) visit(parsed);
			}
		} catch {
			// A child can exit between the directory check and the process-tree read.
		}
	};
	visit(pid);
	return [...seen].toSorted((left, right) => left - right);
}

class RendererSession {
	#profile: string | null = null;
	#port: number | null = null;
	#child: Bun.Subprocess | null = null;
	#candidate: ProcessIdentity | null = null;
	#group: CodexProcessGroupIdentity | null = null;
	#stdout: Promise<string> | null = null;
	#stderr: Promise<string> | null = null;
	#cdp: Cdp | null = null;
	#closePromise: Promise<BoardRendererCleanup> | null = null;
	readonly #observed = new Set<number>();

	private constructor(
		readonly fixture: ViteDevServer,
		readonly options: Required<BoardRenderingOwnerOptions>,
	) {}

	get pid(): number | null {
		return this.#child?.pid ?? null;
	}

	get profile(): string | null {
		return this.#profile;
	}

	get port(): number | null {
		return this.#port;
	}

	static async acquire(
		fixture: ViteDevServer,
		url: string,
		options: Required<BoardRenderingOwnerOptions>,
	): Promise<RendererSession> {
		const session = new RendererSession(fixture, options);
		try {
			const chromiumPath = requiredExecutable("chromium", options.chromiumPath || undefined);
			const setsidPath = requiredExecutable("setsid", options.setsidPath || undefined);
			session.#profile = mkdtempSync(join(tmpdir(), "archboard-board-renderer-"));
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
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});
			session.#candidate = processIdentity(session.#child.pid);
			session.observe();
			session.#stdout = new Response(readablePipe(session.#child.stdout)).text();
			session.#stderr = new Response(readablePipe(session.#child.stderr)).text();
			session.#group = await captureGroup(
				session.#candidate,
				Date.now() + options.cleanupTimeoutMs,
			);
			await session.connect(url);
			return session;
		} catch (error) {
			const cleanup = await session.close();
			const acquisition = new BoardRendererError(
				"Board renderer could not start.",
				"startup",
				[],
				error,
			);
			if (!cleanup.clean)
				throw new AggregateError(
					[acquisition, new Error(`Renderer startup cleanup failed: ${JSON.stringify(cleanup)}`)],
					"Board renderer startup and cleanup failed.",
					{ cause: error },
				);
			throw acquisition;
		}
	}

	async run(job: BoardRendererJob): Promise<BoardRendererJobResult> {
		const cdp = this.#cdp;
		if (!cdp || !this.#child)
			throw new BoardRendererError("Board renderer is not ready.", "startup");
		if (this.#child.exitCode !== null)
			throw new BoardRendererError(
				`Board renderer Chromium exited with code ${this.#child.exitCode}.`,
				"process-exit",
				cdp.diagnostics(),
			);
		try {
			const value = await cdp.evaluate(
				`window.archboardBoardRenderer?.run(${JSON.stringify(job)})`,
				this.options.jobTimeoutMs,
			);
			if (!value || typeof value !== "object")
				throw new Error("Renderer page returned no structured result.");
			return value as BoardRendererJobResult;
		} catch (error) {
			const phase = await this.pageState().catch(() => null);
			throw new BoardRendererError(
				"Board renderer job failed.",
				phase?.phase ?? "unavailable",
				cdp.diagnostics(),
				error,
			);
		}
	}

	close(): Promise<BoardRendererCleanup> {
		if (this.#closePromise) return this.#closePromise;
		this.#closePromise = this.closeOnce();
		return this.#closePromise;
	}

	private async connect(url: string): Promise<void> {
		if (!this.#child || this.#port === null) throw new Error("Renderer process is incomplete.");
		const base = `http://127.0.0.1:${this.#port}`;
		const deadline = Date.now() + this.options.startupTimeoutMs;
		while (Date.now() < deadline) {
			if (this.#child.exitCode !== null)
				throw new Error(`Chromium exited during startup with code ${this.#child.exitCode}.`);
			try {
				if ((await fetch(`${base}/json/version`)).ok) break;
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
		if (!version.ok) throw new Error("Chromium did not bind its private control port.");
		const target = (await (
			await fetch(`${base}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
		).json()) as { webSocketDebuggerUrl?: unknown };
		if (typeof target.webSocketDebuggerUrl !== "string")
			throw new Error("Chromium did not create the private renderer target.");
		this.#cdp = await Cdp.connect(target.webSocketDebuggerUrl, this.options.startupTimeoutMs);
		for (const domain of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"])
			await this.#cdp.call(domain, {}, this.options.startupTimeoutMs);
		await this.#cdp.call("Page.navigate", { url }, this.options.startupTimeoutMs);
		while (Date.now() < deadline) {
			const state = await this.pageState().catch(() => null);
			if (state?.phase === "ready") return;
			await Bun.sleep(25);
		}
		throw new Error("Renderer page did not become ready before its startup deadline.");
	}

	private async pageState(): Promise<RendererPageState | null> {
		if (!this.#cdp) return null;
		const value = await this.#cdp.evaluate(
			"window.archboardBoardRenderer?.state ?? null",
			this.options.startupTimeoutMs,
		);
		return value && typeof value === "object" ? (value as RendererPageState) : null;
	}

	private async closeOnce(): Promise<BoardRendererCleanup> {
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
				if (processGroups.inspect(group) === "owned") processGroups.signal(group, "SIGTERM");
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
		}
		const [leaderSettled, stdoutSettled, stderrSettled] = await Promise.all([
			this.#child ? settlesBefore(this.#child.exited, deadline) : Promise.resolve(true),
			this.#stdout ? settlesBefore(this.#stdout, deadline) : Promise.resolve(true),
			this.#stderr ? settlesBefore(this.#stderr, deadline) : Promise.resolve(true),
		]);
		let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		while (survivors.length > 0 && Date.now() < deadline) {
			await Bun.sleep(Math.min(25, Math.max(0, deadline - Date.now())));
			survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		}
		const processesGone = survivors.length === 0;
		if (groupAbsent && processesGone && this.#profile) {
			try {
				rmSync(this.#profile, { recursive: true, force: true });
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
			}
		}
		const profileRemoved = !this.#profile || !existsSync(this.#profile);
		const portReleased = await loopbackPortIsAvailable(this.#port);
		const fixtureClosed = true;
		const clean =
			groupAbsent &&
			processesGone &&
			leaderSettled &&
			stdoutSettled &&
			stderrSettled &&
			profileRemoved &&
			portReleased &&
			fixtureClosed &&
			errors.length === 0;
		return {
			clean,
			pids,
			processesGone,
			survivors,
			groupAbsent,
			leaderSettled,
			stdoutSettled,
			stderrSettled,
			profileRemoved,
			portReleased,
			fixtureClosed,
			errors,
		};
	}

	private observe(): void {
		if (!this.#child) return;
		for (const pid of ownedProcessIds(this.#child.pid)) this.#observed.add(pid);
	}
}

function fixtureUrl(server: ViteDevServer): string {
	const address = server.httpServer?.address();
	if (!address || typeof address === "string")
		throw new Error("Board renderer fixture server has no loopback address.");
	return `http://127.0.0.1:${address.port}${rendererPage}`;
}

export function createBoardRenderingOwner(options: BoardRenderingOwnerOptions = {}) {
	const resolved: Required<BoardRenderingOwnerOptions> = {
		chromiumPath:
			options.chromiumPath ??
			process.env.ARCHBOARD_RENDERER_CHROMIUM ??
			Bun.which("chromium") ??
			"",
		setsidPath: options.setsidPath ?? Bun.which("setsid") ?? "",
		jobTimeoutMs: options.jobTimeoutMs ?? BOARD_RENDER_JOB_TIMEOUT_MS,
		startupTimeoutMs: options.startupTimeoutMs ?? BOARD_RENDER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: options.cleanupTimeoutMs ?? BOARD_RENDER_CLEANUP_MS,
	};
	let started = false;
	let accepting = false;
	let stopping = false;
	let active = false;
	let queued = 0;
	let fixture: ViteDevServer | null = null;
	let session: RendererSession | null = null;
	let acquisition: Promise<RendererSession> | null = null;
	let tail: Promise<void> = Promise.resolve();
	let stopPromise: Promise<BoardRendererCleanup> | null = null;
	let lastCleanup: BoardRendererCleanup | null = null;

	const start = (): void => {
		if (started) return;
		started = true;
		accepting = true;
	};

	const acquire = async (): Promise<RendererSession> => {
		if (session) return session;
		if (acquisition) return acquisition;
		acquisition = (async () => {
			if (!fixture) {
				fixture = await createServer({
					configFile: false,
					root: repositoryRoot,
					logLevel: "error",
					optimizeDeps: {
						noDiscovery: true,
						include: ["@excalidraw/excalidraw", "@excalidraw/mermaid-to-excalidraw", "mermaid"],
					},
					server: { host: "127.0.0.1", port: 0, strictPort: false, watch: null },
				});
				await fixture.listen();
			}
			if (stopping) throw new Error("Board renderer stopped during startup.");
			const acquired = await RendererSession.acquire(fixture, fixtureUrl(fixture), resolved);
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

	const execute = async (job: BoardRendererJob): Promise<BoardRendererJobResult> => {
		if (!started || !accepting) throw new Error("Board renderer is not accepting work.");
		queued += 1;
		let resolveResult!: (result: BoardRendererJobResult) => void;
		let rejectResult!: (error: unknown) => void;
		const result = new Promise<BoardRendererJobResult>((resolveJob, rejectJob) => {
			resolveResult = resolveJob;
			rejectResult = rejectJob;
		});
		const before = tail;
		tail = (async () => {
			await before;
			queued -= 1;
			if (!accepting) {
				rejectResult(new Error("Board renderer stopped before queued work began."));
				return undefined;
			}
			active = true;
			try {
				resolveResult(await (await acquire()).run(job));
			} catch (error) {
				let failure = error;
				const failed = session;
				session = null;
				if (failed) {
					const cleanup = await failed.close();
					if (!cleanup.clean)
						failure = new AggregateError(
							[error, new Error(`Renderer failure cleanup failed: ${JSON.stringify(cleanup)}`)],
							"Board renderer job and cleanup failed.",
						);
				}
				rejectResult(failure);
			} finally {
				active = false;
			}
			return undefined;
		})();
		return result;
	};

	const stop = (): Promise<BoardRendererCleanup> => {
		if (stopPromise) return stopPromise;
		accepting = false;
		stopping = true;
		stopPromise = (async () => {
			const acquired = await acquisition?.catch(() => null);
			const current = session ?? acquired;
			session = null;
			current?.close();
			await tail;
			let cleanup: BoardRendererCleanup;
			if (current) cleanup = await current.close();
			else {
				const errors: string[] = [];
				cleanup = {
					clean: errors.length === 0,
					pids: [],
					processesGone: true,
					survivors: [],
					groupAbsent: true,
					leaderSettled: true,
					stdoutSettled: true,
					stderrSettled: true,
					profileRemoved: true,
					portReleased: true,
					fixtureClosed: true,
					errors,
				};
			}
			let fixtureClosed = true;
			const errors = [...cleanup.errors];
			if (fixture) {
				try {
					await fixture.close();
					fixtureClosed = !fixture.httpServer?.listening;
				} catch (error) {
					errors.push(error instanceof Error ? error.message : String(error));
					fixtureClosed = false;
				}
			}
			cleanup = {
				...cleanup,
				fixtureClosed,
				errors,
				clean: cleanup.clean && fixtureClosed && errors.length === 0,
			};
			fixture = null;
			lastCleanup = cleanup;
			if (!cleanup.clean)
				throw new Error(`Board renderer cleanup failed: ${JSON.stringify(cleanup)}`);
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
			chromiumPid: session?.pid ?? null,
			profile: session?.profile ?? null,
			controlPort: session?.port ?? null,
		}),
		lastCleanup: (): BoardRendererCleanup | null => lastCleanup,
	});
}
