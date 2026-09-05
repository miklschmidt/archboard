import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { createServer, type ViteDevServer } from "vite";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { projectPreviewSnapshot } from "../src/ui/board-preview/index.js";
import { readNote } from "../src/runtime/engine/board-io.js";
import { applyElementInput } from "../src/runtime/engine/apply-element-input.js";
import {
	processGroupExists,
	processIdentity,
	type ProcessIdentity,
} from "../src/runtime/engine/process-group.js";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "../src/runtime/codex-process/process-group.js";
import type { ServerElement } from "../src/runtime/engine/types.js";
import { derivedId, isBlockId } from "../src/shared/ids/ids.js";

const root = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(root, "docs/design/server-rendering-boundary-fixtures");
const fixtureNote = join(fixtureRoot, "board.excalidraw.md");
const chromium = "/run/current-system/sw/bin/chromium";
const setsid = "/run/current-system/sw/bin/setsid";
const jobTimeoutMs = 20_000;
const cleanupTimeoutMs = 5_000;
const cleanupPollMs = 50;
const processGroups = createCodexProcessGroupOperations();

type JsonRecord = Record<string, unknown>;
type RendererJobMode = "normal" | "missing-image" | "stall" | "immediate-evaluation-failure";
type RendererAcquisitionFailure =
	| "before-profile"
	| "after-profile"
	| "after-port"
	| "after-spawn-before-group-capture"
	| "group-capture-failure"
	| "group-capture-timeout"
	| "after-spawn";
type FixtureAcquisitionFailure = "before-vite-create" | "after-vite-create" | "after-vite-listen";

function requirePreflight(): void {
	for (const file of [
		chromium,
		setsid,
		fixtureNote,
		join(fixtureRoot, "chromium.html"),
		join(fixtureRoot, "diagram.mmd"),
		join(root, "node_modules", "@excalidraw", "excalidraw", "package.json"),
		join(root, "node_modules", "@excalidraw", "mermaid-to-excalidraw", "package.json"),
		join(root, "node_modules", "mermaid", "package.json"),
	]) {
		if (!existsSync(file))
			throw new Error(`Preflight failed: required local input is absent: ${file}`);
	}
}

function ownedOutputDirectory(argv: readonly string[]): string {
	if (argv.length > 0)
		throw new Error(
			"This proof owns its output. Run without arguments; it creates one disposable report directory under the system temporary root.",
		);
	return mkdtempSync(join(tmpdir(), "archboard-server-rendering-proof-"));
}

function pipe(stream: ReadableStream<Uint8Array> | number | undefined): ReadableStream<Uint8Array> {
	if (!stream || typeof stream === "number")
		throw new Error("Child did not expose the requested output pipe.");
	return stream;
}

function snippet(text: string, limit = 4_000): string {
	return text.length <= limit ? text : `${text.slice(-limit)}\n[truncated]`;
}

function ownedProcessIds(pid: number): number[] {
	const seen = new Set<number>();
	const visit = (candidate: number) => {
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
			// Processes can finish while their group is sampled.
		}
	};
	visit(pid);
	return [...seen].toSorted((left, right) => left - right);
}

function residentBytes(pids: readonly number[]): number {
	return pids.reduce((total, pid) => {
		try {
			const match = readFileSync(`/proc/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)\s+kB$/m);
			return total + (match ? Number(match[1]) * 1024 : 0);
		} catch {
			return total;
		}
	}, 0);
}

function reserveLoopbackPort(): number {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response("reserved"),
	});
	const { port } = server;
	server.stop(true);
	if (typeof port !== "number") throw new Error("Could not reserve a loopback port.");
	return port;
}

function loopbackPortIsAvailable(port: number | null): boolean {
	if (port === null) return true;
	let server: ReturnType<typeof Bun.serve> | null = null;
	try {
		server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("audit") });
		return true;
	} catch {
		return false;
	} finally {
		server?.stop(true);
	}
}

function injectAcquisitionFailure<Stage extends string>(
	stage: Stage,
	injected: Stage | undefined,
): void {
	if (stage === injected) throw new Error(`Injected acquisition failure at ${stage}.`);
}

interface CdpEvent {
	method: string;
	params: JsonRecord;
}

class CdpTimeoutError extends Error {
	constructor(
		readonly method: string,
		readonly timeoutMs: number,
	) {
		super(`DevTools ${method} timed out after ${timeoutMs} ms.`);
		this.name = "CdpTimeoutError";
	}
}

class RendererJobError extends Error {
	constructor(
		readonly job: string,
		readonly phase: JsonRecord,
		readonly diagnostics: JsonRecord[],
		readonly proof: JsonRecord,
		cause: unknown,
	) {
		super(
			`Renderer ${job} failed in phase ${String(phase["phase"] ?? "unknown")}: ${(cause as Error).message}; ` +
				`page diagnostics=${JSON.stringify(diagnostics)}; proof=${JSON.stringify(proof)}`,
			{ cause },
		);
		this.name = "RendererJobError";
	}
}

class TimeoutOracleRejectionError extends Error {
	constructor(
		readonly reason: "job" | "phase" | "cause" | "method" | "duration",
		cause: unknown,
	) {
		const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
		super(
			`Intentional timeout oracle rejected the job because its ${reason} did not match: ${detail}`,
			{
				cause,
			},
		);
		this.name = "TimeoutOracleRejectionError";
	}
}

class Cdp {
	readonly #pending = new Map<
		number,
		{ resolve(value: JsonRecord): void; reject(reason: Error): void }
	>();
	readonly #requests = new Map<string, string>();
	readonly events: CdpEvent[] = [];
	#nextId = 1;

	private constructor(readonly socket: WebSocket) {
		socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
		socket.addEventListener("error", () => this.rejectPending("DevTools socket failed."));
		socket.addEventListener("close", () => this.rejectPending("DevTools socket closed."));
	}

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

	async evaluate(expression: string, timeoutMs = 5_000): Promise<unknown> {
		const answer = await this.call(
			"Runtime.evaluate",
			{ expression, awaitPromise: true, returnByValue: true },
			timeoutMs,
		);
		if (answer["exceptionDetails"])
			throw new Error(`Page evaluation failed: ${JSON.stringify(answer["exceptionDetails"])}`);
		return (answer["result"] as JsonRecord | undefined)?.["value"];
	}

	close(): void {
		this.socket.close();
	}

	diagnostics(): JsonRecord[] {
		return this.events
			.filter((event) => {
				if (
					event.method === "Runtime.consoleAPICalled" ||
					event.method === "Runtime.exceptionThrown"
				)
					return true;
				if (event.method === "Network.loadingFailed") return true;
				if (event.method === "Network.responseReceived") {
					const response = event.params["response"] as JsonRecord | undefined;
					return typeof response?.["status"] === "number" && response["status"] >= 400;
				}
				return event.method === "Log.entryAdded";
			})
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
			if (message.error)
				pending.reject(new Error(message.error.message ?? "DevTools command failed."));
			else pending.resolve(message.result ?? {});
			return;
		}
		if (!message.method) return;
		const params = message.params ?? {};
		if (message.method === "Network.requestWillBeSent") {
			const request = params["request"] as JsonRecord | undefined;
			if (typeof params["requestId"] === "string" && typeof request?.["url"] === "string")
				this.#requests.set(params["requestId"], request["url"]);
		}
		this.events.push({ method: message.method, params });
	}

	private rejectPending(message: string): void {
		for (const pending of this.#pending.values()) pending.reject(new Error(message));
		this.#pending.clear();
	}
}

interface CleanupAudit {
	pids: number[];
	processGroup: number | null;
	processGroupProven: boolean;
	candidateLeaderPid: number | null;
	candidateLeaderStartTime: string | null;
	groupAbsent: boolean;
	groupError: string | null;
	survivors: number[];
	leaderSettled: boolean;
	stdoutSettled: boolean;
	stderrSettled: boolean;
	pipesSettled: boolean;
	clean: boolean;
	profile: string | null;
	profileRemoved: boolean;
	port: number | null;
	portReleased: boolean;
	stdout: string;
	stderr: string;
}

interface RendererProcessGroupCandidate {
	readonly leader: ProcessIdentity;
	readonly expectedGroup: number;
}

async function settlesBefore(promise: Promise<unknown>, deadline: number): Promise<boolean> {
	const remainingMs = Math.max(0, deadline - Date.now());
	return await Promise.race([
		promise.then(
			() => true,
			() => true,
		),
		Bun.sleep(remainingMs).then(() => false),
	]);
}

async function waitForProcessGroupAbsence(
	identity: CodexProcessGroupIdentity,
	deadline: number,
): Promise<boolean> {
	while (processGroupExists(identity.pgid)) {
		const ownership = processGroups.inspect(identity);
		if (ownership === "reused" || ownership === "unproven") return false;
		if (Date.now() >= deadline) return false;
		await Bun.sleep(Math.min(cleanupPollMs, deadline - Date.now()));
	}
	return true;
}

function captureRendererProcessGroupCandidate(leaderPid: number): RendererProcessGroupCandidate {
	return { leader: processIdentity(leaderPid), expectedGroup: leaderPid };
}

function captureCandidateProcessGroup(
	candidate: RendererProcessGroupCandidate,
): CodexProcessGroupIdentity {
	const captured = processGroups.capture(candidate.leader.pid);
	if (
		captured.pgid !== candidate.expectedGroup ||
		captured.leaderStartTime !== candidate.leader.startTime
	)
		throw new Error(
			`Chromium process group candidate ${candidate.leader.pid} no longer matches its spawn identity.`,
		);
	return captured;
}

async function captureRendererProcessGroup(
	candidate: RendererProcessGroupCandidate,
	deadline: number,
	injectedFailure?: RendererAcquisitionFailure,
): Promise<CodexProcessGroupIdentity> {
	if (injectedFailure === "group-capture-failure")
		throw new Error("Injected acquisition failure at group-capture-failure.");
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			if (injectedFailure === "group-capture-timeout")
				throw new Error("Injected group capture timeout.");
			return captureCandidateProcessGroup(candidate);
		} catch (error) {
			lastError = error;
			await Bun.sleep(Math.max(0, Math.min(cleanupPollMs, deadline - Date.now())));
		}
	}
	throw new Error(
		`Chromium process ${candidate.leader.pid} did not establish its dedicated group: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}.`,
		{ cause: lastError },
	);
}

async function settledPipeText(promise: Promise<string> | null, settled: boolean): Promise<string> {
	if (!settled) return "[pipe did not settle before cleanup deadline]";
	try {
		return snippet(await (promise ?? Promise.resolve("")));
	} catch (error) {
		return `[pipe failed: ${error instanceof Error ? error.message : String(error)}]`;
	}
}

interface MemorySample {
	pids: number[];
	residentBytes: number;
}

interface JobEvidence {
	name: string;
	durationMs: number;
	result: JsonRecord;
	phase: JsonRecord;
}

class RendererAcquisitionError extends Error {
	constructor(
		readonly stage: string,
		readonly cleanup: CleanupAudit,
		cause: unknown,
	) {
		super(`Renderer acquisition failed at ${stage}; cleanup=${JSON.stringify(cleanup)}`, { cause });
		this.name = "RendererAcquisitionError";
	}
}

class RendererSession {
	readonly startedAt = performance.now();
	#profile: string | null = null;
	#port: number | null = null;
	#child: Bun.Subprocess | null = null;
	#processGroupCandidate: RendererProcessGroupCandidate | null = null;
	#processGroup: CodexProcessGroupIdentity | null = null;
	#stdout: Promise<string> | null = null;
	#stderr: Promise<string> | null = null;
	#cdp: Cdp | null = null;
	#running = false;
	#maxConcurrentJobs = 0;
	readonly #observed = new Set<number>();

	private constructor() {}

	get profile(): string {
		if (!this.#profile) throw new Error("Renderer profile is not acquired.");
		return this.#profile;
	}

	get port(): number {
		if (this.#port === null) throw new Error("Renderer port is not acquired.");
		return this.#port;
	}

	get child(): Bun.Subprocess {
		if (!this.#child) throw new Error("Renderer process is not acquired.");
		return this.#child;
	}

	static async acquire(injectedFailure?: RendererAcquisitionFailure): Promise<RendererSession> {
		const session = new RendererSession();
		let stage = "before-profile";
		try {
			injectAcquisitionFailure("before-profile", injectedFailure);
			stage = "profile";
			session.#profile = mkdtempSync(join(tmpdir(), "archboard-server-rendering-chromium-"));
			stage = "after-profile";
			injectAcquisitionFailure("after-profile", injectedFailure);
			stage = "port";
			session.#port = reserveLoopbackPort();
			stage = "after-port";
			injectAcquisitionFailure("after-port", injectedFailure);
			stage = "spawn";
			session.#child = Bun.spawn({
				cmd: [
					setsid,
					chromium,
					"--headless=new",
					"--disable-gpu",
					"--no-first-run",
					"--no-default-browser-check",
					"--disable-crash-reporter",
					`--user-data-dir=${session.profile}`,
					`--remote-debugging-port=${session.port}`,
					"about:blank",
				],
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			stage = "post-spawn-candidate";
			const candidate = captureRendererProcessGroupCandidate(session.child.pid);
			session.#processGroupCandidate = candidate;
			session.observe(ownedProcessIds(session.child.pid));
			session.#stdout = new Response(pipe(session.child.stdout)).text();
			session.#stderr = new Response(pipe(session.child.stderr)).text();
			stage = "after-spawn-before-group-capture";
			injectAcquisitionFailure("after-spawn-before-group-capture", injectedFailure);
			stage = "group-capture";
			session.#processGroup = await captureRendererProcessGroup(
				candidate,
				Date.now() + cleanupTimeoutMs,
				injectedFailure,
			);
			stage = "after-spawn";
			injectAcquisitionFailure("after-spawn", injectedFailure);
			return session;
		} catch (error) {
			const cleanup = await session.shutdown();
			const acquisitionFailure = new RendererAcquisitionError(stage, cleanup, error);
			if (!cleanup.clean || !cleanup.profileRemoved || !cleanup.portReleased)
				throw new AggregateError(
					[
						acquisitionFailure,
						new Error(`Partial renderer acquisition leaked: ${JSON.stringify(cleanup)}`),
					],
					"Partial renderer acquisition cleanup failed.",
					{ cause: error },
				);
			throw acquisitionFailure;
		}
	}

	async start(url: string): Promise<{ startup: MemorySample; startupMs: number }> {
		const child = this.child;
		const base = `http://127.0.0.1:${this.port}`;
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			if (child.exitCode !== null)
				throw new Error(
					`Chromium exited during startup (${child.exitCode}): ${snippet(await this.stderrText())}`,
				);
			try {
				if ((await fetch(`${base}/json/version`)).ok) break;
			} catch {
				// The private DevTools server has not bound its loopback port yet.
			}
			await Bun.sleep(50);
		}
		if (child.exitCode !== null || !(await fetch(`${base}/json/version`)).ok)
			throw new Error("Chromium did not bind its private DevTools loopback port within 5 seconds.");
		const startupPids = ownedProcessIds(child.pid);
		this.observe(startupPids);
		const target = (await (
			await fetch(`${base}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
		).json()) as { webSocketDebuggerUrl?: unknown };
		if (typeof target.webSocketDebuggerUrl !== "string")
			throw new Error("Chromium did not create the private renderer target.");
		this.#cdp = await Cdp.connect(target.webSocketDebuggerUrl);
		for (const domain of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"])
			await this.#cdp.call(domain);
		await this.#cdp.call("Page.navigate", { url });
		await this.waitForReady();
		return {
			startup: { pids: startupPids, residentBytes: residentBytes(startupPids) },
			startupMs: performance.now() - this.startedAt,
		};
	}

	async runJob(name: string, mode: RendererJobMode = "normal"): Promise<JobEvidence> {
		const cdp = this.#cdp;
		const child = this.child;
		if (!cdp) throw new Error("Renderer has not started.");
		if (child.exitCode !== null)
			throw new Error(`Renderer ${name} cannot run: Chromium exited (${child.exitCode}).`);
		if (this.#running) throw new Error(`Renderer already owns a job; refused concurrent ${name}.`);
		this.#running = true;
		this.#maxConcurrentJobs = Math.max(this.#maxConcurrentJobs, 1);
		const startedAt = performance.now();
		let stagedImmediateFailure = false;
		try {
			if (mode === "immediate-evaluation-failure") {
				const staged = await cdp.evaluate(
					`window.stageArchboardRendererProof?.(${JSON.stringify(name)}, "intentional-timeout")`,
				);
				if (
					!staged ||
					typeof staged !== "object" ||
					(staged as JsonRecord)["job"] !== name ||
					(staged as JsonRecord)["phase"] !== "intentional-timeout"
				)
					throw new Error(
						`Immediate failure did not stage ${name} at intentional-timeout: ${JSON.stringify(staged)}.`,
					);
				stagedImmediateFailure = true;
			}
			const expression =
				mode === "immediate-evaluation-failure"
					? '(() => { throw new Error("intentional immediate evaluation failure"); })()'
					: `window.runArchboardRendererProof?.(${JSON.stringify(mode)})`;
			const value = await cdp.evaluate(expression, jobTimeoutMs);
			if (!value || typeof value !== "object")
				throw new Error(`Renderer ${name} returned no structured result.`);
			const phase = await this.proofState();
			return {
				name,
				durationMs: performance.now() - startedAt,
				result: value as JsonRecord,
				phase,
			};
		} catch (error) {
			const phase = await this.proofState().catch(() => ({ phase: "unavailable" }));
			throw new RendererJobError(name, phase, cdp.diagnostics(), phase, error);
		} finally {
			if (stagedImmediateFailure)
				await cdp.evaluate("window.releaseArchboardRendererProof?.()").catch(() => undefined);
			this.#running = false;
		}
	}

	memory(): MemorySample {
		const pids = ownedProcessIds(this.child.pid);
		this.observe(pids);
		return { pids, residentBytes: residentBytes(pids) };
	}

	serialEvidence(): { maxConcurrentJobs: number } {
		return { maxConcurrentJobs: this.#maxConcurrentJobs };
	}

	terminateProcessGroupForProof(): void {
		if (!this.#processGroup) throw new Error("Renderer process group is not acquired.");
		if (processGroupExists(this.#processGroup.pgid))
			processGroups.signal(this.#processGroup, "SIGTERM");
	}

	async shutdown(): Promise<CleanupAudit> {
		this.#cdp?.close();
		const child = this.#child;
		const candidate = this.#processGroupCandidate;
		let processGroup = this.#processGroup;
		let processGroupProven = processGroup !== null;
		if (child) this.observe(ownedProcessIds(child.pid));
		const pids = [...this.#observed].toSorted((left, right) => left - right);
		const cleanupStartedAt = Date.now();
		const deadline = cleanupStartedAt + cleanupTimeoutMs;
		let groupAbsent = child === null;
		let groupError: string | null = null;
		if (child && !candidate)
			groupError = "Chromium spawned without a guarded process-group candidate.";
		if (child && candidate && !processGroup) {
			try {
				processGroup = await captureRendererProcessGroup(candidate, deadline);
				processGroupProven = true;
			} catch (error) {
				groupError =
					"Could not prove Chromium's process group during cleanup: " +
					(error instanceof Error ? error.message : String(error));
			}
		}
		if (processGroup && processGroupExists(processGroup.pgid)) {
			try {
				processGroups.signal(processGroup, "SIGTERM");
				groupAbsent = await waitForProcessGroupAbsence(
					processGroup,
					cleanupStartedAt + Math.max(0, cleanupTimeoutMs - 1_000),
				);
				if (!groupAbsent && processGroupExists(processGroup.pgid)) {
					processGroups.signal(processGroup, "SIGKILL");
					groupAbsent = await waitForProcessGroupAbsence(processGroup, deadline);
				}
			} catch (error) {
				groupError = error instanceof Error ? error.message : String(error);
			}
		}
		if (processGroup && groupError === null) groupAbsent = !processGroupExists(processGroup.pgid);
		const [leaderSettled, stdoutSettled, stderrSettled] = await Promise.all([
			child ? settlesBefore(child.exited, deadline) : Promise.resolve(true),
			this.#stdout ? settlesBefore(this.#stdout, deadline) : Promise.resolve(child === null),
			this.#stderr ? settlesBefore(this.#stderr, deadline) : Promise.resolve(child === null),
		]);
		const pipesSettled = stdoutSettled && stderrSettled;
		let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		while (survivors.length > 0 && Date.now() < deadline) {
			await Bun.sleep(cleanupPollMs);
			survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		}
		const processesGone = survivors.length === 0;
		if (groupAbsent && this.#profile) rmSync(this.#profile, { recursive: true, force: true });
		const profileRemoved = !this.#profile || (groupAbsent && !existsSync(this.#profile));
		const portReleased = loopbackPortIsAvailable(this.#port);
		const clean =
			groupAbsent &&
			groupError === null &&
			(!child || processGroupProven) &&
			processesGone &&
			leaderSettled &&
			pipesSettled &&
			profileRemoved &&
			portReleased;
		return {
			pids,
			processGroup: processGroup?.pgid ?? candidate?.expectedGroup ?? null,
			processGroupProven,
			candidateLeaderPid: candidate?.leader.pid ?? null,
			candidateLeaderStartTime: candidate?.leader.startTime ?? null,
			groupAbsent,
			groupError,
			survivors,
			leaderSettled,
			stdoutSettled,
			stderrSettled,
			pipesSettled,
			clean,
			profile: this.#profile,
			profileRemoved,
			port: this.#port,
			portReleased,
			stdout: await settledPipeText(this.#stdout, stdoutSettled),
			stderr: await settledPipeText(this.#stderr, stderrSettled),
		};
	}

	private async waitForReady(): Promise<void> {
		const deadline = Date.now() + jobTimeoutMs;
		let state: JsonRecord = { phase: "unavailable" };
		while (Date.now() < deadline) {
			state = await this.proofState();
			if (state["phase"] === "ready") return;
			if (state["status"] === "failed") break;
			await Bun.sleep(50);
		}
		throw new Error(
			`Renderer fixture did not become ready in phase ${String(state["phase"] ?? "unknown")}; ` +
				`page diagnostics=${JSON.stringify(this.#cdp?.diagnostics() ?? [])}; proof=${JSON.stringify(state)}`,
		);
	}

	private async proofState(): Promise<JsonRecord> {
		if (!this.#cdp) return { phase: "unavailable" };
		const encoded = await this.#cdp.evaluate(
			"JSON.stringify(window.__archboardRendererProof ?? null)",
		);
		if (typeof encoded !== "string") return { phase: "unavailable" };
		try {
			return JSON.parse(encoded) as JsonRecord;
		} catch {
			return { phase: "unparseable", value: encoded };
		}
	}

	private observe(pids: readonly number[]): void {
		for (const pid of pids) this.#observed.add(pid);
	}

	private async stdoutText(): Promise<string> {
		return await (this.#stdout ?? Promise.resolve(""));
	}

	private async stderrText(): Promise<string> {
		return await (this.#stderr ?? Promise.resolve(""));
	}
}

function requireRecord(record: JsonRecord, key: string): JsonRecord {
	const found = record[key];
	if (!found || typeof found !== "object" || Array.isArray(found))
		throw new Error(`Proof result has no ${key} object.`);
	return found as JsonRecord;
}

function requireBoolean(value: unknown, message: string): void {
	if (value !== true) throw new Error(message);
}

function requireNumber(value: unknown, message: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
	return value;
}

function requireSha256(value: unknown, message: string): string {
	if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error(message);
	return value;
}

function exportFiles(files: Record<string, unknown>): BinaryFiles {
	for (const [id, raw] of Object.entries(files)) {
		if (!raw || typeof raw !== "object") throw new Error(`Persisted file ${id} is invalid.`);
		const file = raw as JsonRecord;
		if (
			file["id"] !== id ||
			file["mimeType"] !== "image/png" ||
			typeof file["dataURL"] !== "string" ||
			!file["dataURL"].startsWith("data:image/png;base64,") ||
			typeof file["created"] !== "number"
		)
			throw new Error(`Persisted file ${id} is not a complete PNG export file.`);
	}
	return files as unknown as BinaryFiles;
}

function assertPng(result: JsonRecord): void {
	const png = requireRecord(result, "png");
	if (requireNumber(png["bytes"], "PNG byte count is missing.") < 1)
		throw new Error("PNG export is empty.");
	requireSha256(png["hash"], "PNG SHA-256 is missing.");
	requireBoolean(png["isPng"], "PNG signature is invalid.");
	const semantics = requireRecord(png, "semantics");
	const width = requireNumber(semantics["width"], "PNG width is missing.");
	const height = requireNumber(semantics["height"], "PNG height is missing.");
	if (width < 500 || height < 300)
		throw new Error(`PNG dimensions are implausible: ${width}x${height}.`);
	const colors = requireRecord(semantics, "colors");
	const background = requireRecord(colors, "background");
	const service = requireRecord(colors, "service");
	const store = requireRecord(colors, "store");
	const decision = requireRecord(colors, "decision");
	for (const [name, color] of Object.entries({ background, service, store, decision })) {
		if (requireNumber(color["count"], `PNG ${name} colour count is missing.`) < 100)
			throw new Error(`PNG lacks visible ${name} colour pixels.`);
	}
	if (
		requireNumber(service["maxX"], "PNG service bounds missing.") >=
			requireNumber(store["minX"], "PNG store bounds missing.") ||
		requireNumber(decision["minY"], "PNG decision bounds missing.") <=
			requireNumber(service["maxY"], "PNG service bounds missing.")
	)
		throw new Error("PNG fixture regions are not in the expected service, store, decision layout.");
}

function assertSvg(result: JsonRecord): void {
	const svg = requireRecord(result, "svg");
	if (requireNumber(svg["bytes"], "SVG byte count is missing.") < 1)
		throw new Error("SVG export is empty.");
	requireSha256(svg["hash"], "SVG SHA-256 is missing.");
	const semantics = requireRecord(svg, "semantics");
	if (semantics["root"] !== "svg") throw new Error("SVG root is not svg.");
	requireBoolean(semantics["background"], "SVG lacks the persisted background.");
	if (
		!Array.isArray(semantics["fills"]) ||
		semantics["fills"].some(
			(fill) => !fill || typeof fill !== "object" || (fill as JsonRecord)["present"] !== true,
		)
	)
		throw new Error("SVG lacks one of the persisted fixture fills.");
	for (const [key, message] of [
		["hasBoundLabel", "SVG lacks the bound Service API label."],
		["hasExcalifont", "SVG lacks the required Excalifont text."],
		["fontLoaded", "The bundled Excalifont is not loaded."],
		["hasEmbeddedImage", "SVG lacks the persisted embedded image."],
		["hasArrowVisual", "SVG lacks the bound arrow visual."],
	] as const)
		requireBoolean(semantics[key], message);
	if (!Array.isArray(semantics["shapes"]) || semantics["shapes"].length < 8)
		throw new Error("SVG does not contain enough native rendered shapes.");
}

function assertMermaid(result: JsonRecord): void {
	const mermaid = requireRecord(result, "mermaid");
	if (requireNumber(mermaid["elementCount"], "Mermaid element count is missing.") < 5)
		throw new Error("Mermaid conversion returned too few elements.");
	if (result["invalidMermaid"] !== "Error")
		throw new Error("Malformed Mermaid did not reject with Error.");
	const semantics = requireRecord(mermaid, "elements");
	const nodes = semantics["nodes"];
	const edges = semantics["edges"];
	if (!Array.isArray(nodes) || !Array.isArray(edges))
		throw new Error("Mermaid graph summary is absent.");
	const labels = nodes.map((node) => (node as JsonRecord)["label"]).toSorted();
	const connections = edges
		.map((edge) => `${String((edge as JsonRecord)["from"])}>${String((edge as JsonRecord)["to"])}`)
		.toSorted();
	if (
		JSON.stringify(labels) !==
			JSON.stringify(["Board operation", "PNG and SVG", "Server render"]) ||
		JSON.stringify(connections) !==
			JSON.stringify(["Board operation>Server render", "Server render>PNG and SVG"])
	)
		throw new Error(
			`Mermaid graph does not match the canonical labels and connectivity: ${JSON.stringify(semantics)}`,
		);
}

function assertSemantics(result: JsonRecord): void {
	if ("error" in result) throw new Error(`Browser probe failed: ${JSON.stringify(result["error"])}`);
	assertPng(result);
	assertSvg(result);
	assertMermaid(result);
}

function comparable(result: JsonRecord): string {
	return JSON.stringify(result);
}

function loadPersistedRenderInput(): JsonRecord {
	const content = readNote(fixtureNote);
	if (!content) throw new Error(`Canonical persisted board fixture cannot be read: ${fixtureNote}`);
	const snapshot = projectPreviewSnapshot({
		board: "render-proof",
		fingerprint: "canonical-fixture",
		elements: Array.from(content.elements.values()),
		files: exportFiles(Object.fromEntries(content.files)),
	});
	if (snapshot.elements.length !== 9 || Object.keys(snapshot.files).length !== 1)
		throw new Error("Canonical board read did not preserve the expected elements and file.");
	if (!snapshot.elements.every((element) => isBlockId(element.id)))
		throw new Error("Canonical persisted board fixture contains an invalid block id.");
	const byId = new Map(snapshot.elements.map((element) => [element.id, element]));
	const service = byId.get("svc") as JsonRecord | undefined;
	const label = byId.get("label") as JsonRecord | undefined;
	const arrow = byId.get("arrow") as JsonRecord | undefined;
	if (
		!service ||
		!label ||
		!arrow ||
		!Array.isArray(service["boundElements"]) ||
		!service["boundElements"].some((binding) => (binding as JsonRecord)["id"] === "label") ||
		label["containerId"] !== "svc" ||
		(arrow["startBinding"] as JsonRecord | undefined)?.["elementId"] !== "svc" ||
		(arrow["endBinding"] as JsonRecord | undefined)?.["elementId"] !== "store"
	)
		throw new Error(
			"Canonical persisted board fixture lost its bound label or arrow relationship.",
		);
	return {
		elements: snapshot.elements,
		files: exportFiles(snapshot.files),
		appState: { exportBackground: true, viewBackgroundColor: "#f8fafc" },
	};
}

async function rejectMalformedPersistedBoard(output: string): Promise<string> {
	const malformed = join(output, "malformed-board.excalidraw.md");
	const source = readFileSync(fixtureNote, "utf8");
	await Bun.write(malformed, source.replace('"type": "rectangle"', '"type": "not-a-shape"'));
	try {
		readNote(malformed);
		throw new Error("Malformed persisted board was accepted.");
	} catch (error) {
		if (error instanceof Error && error.message === "Malformed persisted board was accepted.")
			throw error;
		return error instanceof Error ? error.name : String(error);
	} finally {
		rmSync(malformed, { force: true });
	}
}

interface FixtureCleanupAudit {
	port: number;
	portReleased: boolean;
	serverCreated: boolean;
	closeCalled: boolean;
	serverListening: boolean;
	watcherWatchedPaths: number;
	closeError: string | null;
	clean: boolean;
}

class FixtureAcquisitionError extends Error {
	constructor(
		readonly stage: string,
		readonly cleanup: FixtureCleanupAudit,
		cause: unknown,
	) {
		super(`Fixture acquisition failed at ${stage}; cleanup=${JSON.stringify(cleanup)}`, { cause });
		this.name = "FixtureAcquisitionError";
	}
}

class FixtureServerOwner {
	#closed = false;

	constructor(
		readonly server: ViteDevServer,
		readonly port: number,
	) {}

	get url(): string {
		return `http://127.0.0.1:${this.port}/chromium.html`;
	}

	async close(): Promise<FixtureCleanupAudit> {
		let closeError: string | null = null;
		try {
			await this.server.close();
			this.#closed = true;
		} catch (error) {
			closeError = error instanceof Error ? error.message : String(error);
		}
		const serverListening = Boolean(this.server.httpServer?.listening);
		const watcherWatchedPaths = Object.keys(this.server.watcher.getWatched()).length;
		const portReleased = loopbackPortIsAvailable(this.port);
		return {
			port: this.port,
			portReleased,
			serverCreated: true,
			closeCalled: this.#closed,
			serverListening,
			watcherWatchedPaths,
			closeError,
			clean:
				this.#closed &&
				!serverListening &&
				watcherWatchedPaths === 0 &&
				portReleased &&
				closeError === null,
		};
	}
}

function unownedFixtureCleanup(port: number): FixtureCleanupAudit {
	const portReleased = loopbackPortIsAvailable(port);
	return {
		port,
		portReleased,
		serverCreated: false,
		closeCalled: false,
		serverListening: false,
		watcherWatchedPaths: 0,
		closeError: null,
		clean: portReleased,
	};
}

async function startFixtureServer(
	input: JsonRecord,
	injectedFailure?: FixtureAcquisitionFailure,
): Promise<FixtureServerOwner> {
	const port = reserveLoopbackPort();
	let owner: FixtureServerOwner | null = null;
	let stage = "before-vite-create";
	try {
		injectAcquisitionFailure("before-vite-create", injectedFailure);
		stage = "vite-create";
		const server = await createServer({
			root: fixtureRoot,
			logLevel: "error",
			server: { host: "127.0.0.1", port, strictPort: true },
			plugins: [
				{
					name: "archboard-server-rendering-input",
					configureServer(vite) {
						vite.middlewares.use("/render-input.json", (request, response, next) => {
							if (request.method !== "GET") return next();
							const missingImage =
								new URL(request.url ?? "/", "http://localhost").searchParams.get("case") ===
								"missing-image";
							response.statusCode = 200;
							response.setHeader("content-type", "application/json");
							response.end(JSON.stringify(missingImage ? { ...input, files: {} } : input));
						});
					},
				},
			],
		});
		owner = new FixtureServerOwner(server, port);
		stage = "after-vite-create";
		injectAcquisitionFailure("after-vite-create", injectedFailure);
		stage = "vite-listen";
		await server.listen();
		stage = "after-vite-listen";
		injectAcquisitionFailure("after-vite-listen", injectedFailure);
		return owner;
	} catch (error) {
		const cleanup = owner ? await owner.close() : unownedFixtureCleanup(port);
		const acquisitionFailure = new FixtureAcquisitionError(stage, cleanup, error);
		if (!cleanup.clean)
			throw new AggregateError(
				[
					acquisitionFailure,
					new Error(`Partial fixture acquisition leaked: ${JSON.stringify(cleanup)}`),
				],
				"Partial fixture acquisition cleanup failed.",
				{ cause: error },
			);
		throw acquisitionFailure;
	}
}

async function runInboundMermaid(result: JsonRecord): Promise<JsonRecord> {
	const mermaid = requireRecord(result, "mermaid");
	const raw = mermaid["rawElements"];
	if (!Array.isArray(raw)) throw new Error("Browser Mermaid result has no element array.");
	const ids = new Map<string, string>();
	const used = new Set<string>();
	for (const element of raw) {
		const source = (element as JsonRecord)["id"];
		if (typeof source !== "string") throw new Error("Mermaid element has no source id.");
		const id = derivedId(`mermaid:${source}`, used);
		used.add(id);
		ids.set(source, id);
	}
	const input = raw.map((element) => {
		const source = element as JsonRecord;
		const start = source["start"] as JsonRecord | undefined;
		const end = source["end"] as JsonRecord | undefined;
		return {
			...source,
			id: ids.get(source["id"] as string),
			...(start && typeof start["id"] === "string" ? { start: { id: ids.get(start["id"]) } } : {}),
			...(end && typeof end["id"] === "string" ? { end: { id: ids.get(end["id"]) } } : {}),
		};
	});
	const board = new Map<string, ServerElement>();
	try {
		applyElementInput(board, { origin: "agent", upserts: input as never[] });
	} catch (error) {
		throw new Error(
			`Canonical inbound Mermaid conversion failed: ${(error as Error).message}; raw=${JSON.stringify(raw)}`,
			{ cause: error },
		);
	}
	const elements = [...board.values()];
	if (elements.length === 0 || !elements.every((element) => isBlockId(element.id)))
		throw new Error(
			"Canonical inbound Mermaid conversion did not yield block-safe Archboard elements.",
		);
	const labels = elements
		.filter((element) => element.type === "text")
		.map((element) => `${element.containerId ?? ""}:${element.text}`)
		.toSorted();
	const arrows = elements
		.filter((element) => element.type === "arrow")
		.map(
			(element) =>
				`${element.startBinding?.elementId ?? ""}>${element.endBinding?.elementId ?? ""}`,
		)
		.toSorted();
	const caller = ids.get("caller")!;
	const render = ids.get("render")!;
	const artifact = ids.get("artifact")!;
	if (
		JSON.stringify(labels) !==
			JSON.stringify(
				[
					`${artifact}:PNG and SVG`,
					`${caller}:Board operation`,
					`${render}:Server render`,
				].toSorted(),
			) ||
		JSON.stringify(arrows) !== JSON.stringify([`${caller}>${render}`, `${render}>${artifact}`])
	)
		throw new Error(
			`Inbound Mermaid shape lost labels or bindings: ${JSON.stringify({ labels, arrows })}`,
		);
	if (
		elements.length !== 8 ||
		JSON.stringify(elements.map((element) => element.type).toSorted()) !==
			JSON.stringify([
				"arrow",
				"arrow",
				"rectangle",
				"rectangle",
				"rectangle",
				"text",
				"text",
				"text",
			])
	)
		throw new Error(
			"Inbound Mermaid conversion did not expand to the expected Archboard element shape.",
		);
	return {
		count: elements.length,
		ids: elements.map((element) => element.id).toSorted(),
		types: elements.map((element) => element.type).toSorted(),
	};
}

interface TimeoutEvidence {
	elapsedMs: number;
	reason: string;
	phase: JsonRecord;
}

function timeoutBounds(): { earliestMs: number; latestMs: number } {
	// Timers can fire a little early against the monotonic clock and a loaded host can deliver late.
	// The bounds retain the 20-second allowance while allowing one percent early and five percent late.
	return {
		earliestMs: jobTimeoutMs - Math.ceil(jobTimeoutMs * 0.01),
		latestMs: jobTimeoutMs + Math.ceil(jobTimeoutMs * 0.05),
	};
}

async function requireRuntimeEvaluateTimeout(
	session: RendererSession,
	name: string,
	mode: RendererJobMode,
): Promise<TimeoutEvidence> {
	const startedAt = performance.now();
	try {
		await session.runJob(name, mode);
	} catch (error) {
		const elapsedMs = performance.now() - startedAt;
		if (!(error instanceof RendererJobError)) throw new TimeoutOracleRejectionError("job", error);
		if (error.job !== name) throw new TimeoutOracleRejectionError("job", error);
		if (error.phase["phase"] !== "intentional-timeout")
			throw new TimeoutOracleRejectionError("phase", error);
		if (!(error.cause instanceof CdpTimeoutError))
			throw new TimeoutOracleRejectionError("cause", error);
		if (error.cause.method !== "Runtime.evaluate" || error.cause.timeoutMs !== jobTimeoutMs)
			throw new TimeoutOracleRejectionError("method", error);
		const bounds = timeoutBounds();
		if (elapsedMs < bounds.earliestMs || elapsedMs > bounds.latestMs)
			throw new TimeoutOracleRejectionError("duration", error);
		return { elapsedMs, reason: error.cause.message, phase: error.phase };
	}
	throw new Error(`Intentional timeout job ${name} completed instead of timing out.`);
}

async function proveImmediateFailureIsNotTimeout(session: RendererSession): Promise<JsonRecord> {
	const startedAt = performance.now();
	let rejection: TimeoutOracleRejectionError | null = null;
	try {
		await requireRuntimeEvaluateTimeout(
			session,
			"intentional-timeout",
			"immediate-evaluation-failure",
		);
	} catch (error) {
		if (error instanceof TimeoutOracleRejectionError) rejection = error;
		else throw error;
	}
	const elapsedMs = performance.now() - startedAt;
	if (!rejection || rejection.reason !== "cause")
		throw new Error(
			`Immediate failure did not prove a non-timeout cause: ${rejection?.reason ?? "no rejection"}.`,
		);
	if (
		!(rejection.cause instanceof RendererJobError) ||
		rejection.cause.job !== "intentional-timeout" ||
		rejection.cause.phase["phase"] !== "intentional-timeout" ||
		rejection.cause.cause instanceof CdpTimeoutError
	)
		throw new Error(
			`Immediate failure did not match the timeout job and phase before its cause was rejected: ${JSON.stringify(
				rejection.cause,
			)}.`,
		);
	if (elapsedMs > Math.ceil(jobTimeoutMs * 0.05))
		throw new Error(`Immediate differently caused failure took ${elapsedMs.toFixed(1)} ms.`);
	return {
		elapsedMs,
		rejection: rejection.message,
		phase: rejection.cause.phase,
		cause: rejection.cause.cause instanceof Error ? rejection.cause.cause.name : "unknown",
	};
}

async function provePartialAcquisitionCleanup(input: JsonRecord): Promise<JsonRecord> {
	const renderer: JsonRecord[] = [];
	for (const stage of [
		"before-profile",
		"after-profile",
		"after-port",
		"after-spawn-before-group-capture",
		"group-capture-failure",
		"group-capture-timeout",
		"after-spawn",
	] as const) {
		try {
			await RendererSession.acquire(stage);
			throw new Error(`Injected renderer acquisition failure ${stage} was accepted.`);
		} catch (error) {
			if (!(error instanceof RendererAcquisitionError)) throw error;
			if (!error.cleanup.clean || !error.cleanup.profileRemoved || !error.cleanup.portReleased)
				throw new Error(
					`Injected renderer acquisition ${stage} did not clean up: ${JSON.stringify(error.cleanup)}`,
					{ cause: error },
				);
			if (
				stage !== "before-profile" &&
				stage !== "after-profile" &&
				stage !== "after-port" &&
				(!error.cleanup.processGroupProven ||
					!error.cleanup.groupAbsent ||
					!error.cleanup.leaderSettled ||
					!error.cleanup.pipesSettled)
			)
				throw new Error(
					`Injected post-spawn acquisition ${stage} did not prove group and pipe cleanup: ${JSON.stringify(error.cleanup)}`,
					{ cause: error },
				);
			renderer.push({ stage, failureStage: error.stage, cleanup: error.cleanup });
		}
	}
	const fixture: JsonRecord[] = [];
	for (const stage of ["before-vite-create", "after-vite-create", "after-vite-listen"] as const) {
		try {
			await startFixtureServer(input, stage);
			throw new Error(`Injected fixture acquisition failure ${stage} was accepted.`);
		} catch (error) {
			if (!(error instanceof FixtureAcquisitionError)) throw error;
			if (!error.cleanup.clean)
				throw new Error(
					`Injected fixture acquisition ${stage} did not clean up: ${JSON.stringify(error.cleanup)}`,
					{ cause: error },
				);
			fixture.push({ stage, cleanup: error.cleanup });
		}
	}
	return { renderer, fixture };
}

const output = ownedOutputDirectory(Bun.argv.slice(2));
const reportPath = join(output, "report.json");
let fixtureServer: FixtureServerOwner | null = null;
let fixtureCleanup: FixtureCleanupAudit | null = null;
let primaryCleanup: CleanupAudit | null = null;
let childExitCleanup: CleanupAudit | null = null;
let replacementCleanup: CleanupAudit | null = null;
let report: JsonRecord = {
	status: "failed",
	output: { directory: output, owner: "probe", repositoryRelative: relative(root, output) },
};
let failure: unknown = null;

try {
	requirePreflight();
	const input = loadPersistedRenderInput();
	const malformedBoard = await rejectMalformedPersistedBoard(output);
	if (malformedBoard !== "Error")
		throw new Error(`Malformed persisted board did not reject with Error: ${malformedBoard}`);
	const partialAcquisition = await provePartialAcquisitionCleanup(input);
	const fixture = await startFixtureServer(input);
	fixtureServer = fixture;
	const primary = await RendererSession.acquire();
	let primaryActionFailure: unknown = null;
	try {
		const startup = await primary.start(fixture.url);
		const first = await primary.runJob("first");
		assertSemantics(first.result);
		const warm = primary.memory();
		const second = await primary.runJob("second");
		assertSemantics(second.result);
		const third = await primary.runJob("third");
		assertSemantics(third.result);
		const steady = primary.memory();
		if (
			comparable(first.result) !== comparable(second.result) ||
			comparable(first.result) !== comparable(third.result)
		)
			throw new Error("Identical persistent-renderer jobs diverged in output or semantics.");
		report = {
			status: "running",
			backend: "isolated server-owned headless Chromium",
			browserClient: "none",
			output: { directory: output, owner: "probe", disposable: true },
			malformedBoard,
			partialAcquisition,
			primary: { startup, first, warm, second, third, steady, serial: primary.serialEvidence() },
		};
		const inbound = await runInboundMermaid(first.result);
		const inboundSecond = await runInboundMermaid(second.result);
		if (JSON.stringify(inbound) !== JSON.stringify(inboundSecond))
			throw new Error(
				"Canonical inbound Mermaid conversion did not preserve stable ids and bindings.",
			);
		const missingImage = await primary.runJob("missing-image", "missing-image");
		let missingImageRejected = false;
		try {
			assertSemantics(missingImage.result);
		} catch {
			missingImageRejected = true;
		}
		if (!missingImageRejected)
			throw new Error("Missing embedded image was accepted as a complete render.");
		const immediateDifferentCause = await proveImmediateFailureIsNotTimeout(primary);
		const timeout = await requireRuntimeEvaluateTimeout(primary, "intentional-timeout", "stall");
		report = {
			status: "passed",
			backend: "isolated server-owned headless Chromium",
			browserClient: "none",
			output: { directory: output, owner: "probe", disposable: true },
			malformedBoard,
			partialAcquisition,
			primary: {
				startup,
				first,
				warm,
				second,
				third,
				steady,
				inbound,
				inboundSecond,
				serial: primary.serialEvidence(),
				immediateDifferentCause,
				timeout,
			},
		};
	} catch (error) {
		primaryActionFailure = error;
	}
	primaryCleanup = await primary.shutdown();
	if (!primaryCleanup.clean || !primaryCleanup.profileRemoved) {
		const cleanupFailure = new Error(
			`Primary renderer cleanup failed: ${JSON.stringify(primaryCleanup)}`,
		);
		if (primaryActionFailure) throw new AggregateError([primaryActionFailure, cleanupFailure]);
		throw cleanupFailure;
	}
	if (primaryActionFailure) throw primaryActionFailure;
	const childExit = await RendererSession.acquire();
	let childExitActionFailure: unknown = null;
	try {
		const startup = await childExit.start(fixture.url);
		childExit.terminateProcessGroupForProof();
		await Promise.race([childExit.child.exited, Bun.sleep(cleanupTimeoutMs)]);
		if (childExit.child.exitCode === null)
			throw new Error(`Renderer child did not exit within ${cleanupTimeoutMs} ms.`);
		let rejection: string | null = null;
		try {
			await childExit.runJob("after-child-exit");
		} catch (error) {
			rejection = (error as Error).message;
		}
		if (!rejection?.includes("Chromium exited"))
			throw new Error(
				`Renderer child exit was not surfaced to the caller: ${rejection ?? "no error"}`,
			);
		report["childExit"] = { startup, exitCode: childExit.child.exitCode, rejection };
	} catch (error) {
		childExitActionFailure = error;
	}
	childExitCleanup = await childExit.shutdown();
	if (!childExitCleanup.clean || !childExitCleanup.profileRemoved) {
		const cleanupFailure = new Error(
			`Child-exit renderer cleanup failed: ${JSON.stringify(childExitCleanup)}`,
		);
		if (childExitActionFailure) throw new AggregateError([childExitActionFailure, cleanupFailure]);
		throw cleanupFailure;
	}
	if (childExitActionFailure) throw childExitActionFailure;
	const replacement = await RendererSession.acquire();
	let replacementActionFailure: unknown = null;
	try {
		const startup = await replacement.start(fixture.url);
		const job = await replacement.runJob("replacement");
		assertSemantics(job.result);
		report["replacement"] = {
			startup,
			job,
			memory: replacement.memory(),
			serial: replacement.serialEvidence(),
		};
	} catch (error) {
		replacementActionFailure = error;
	}
	replacementCleanup = await replacement.shutdown();
	if (!replacementCleanup.clean || !replacementCleanup.profileRemoved) {
		const cleanupFailure = new Error(
			`Replacement renderer cleanup failed: ${JSON.stringify(replacementCleanup)}`,
		);
		if (replacementActionFailure)
			throw new AggregateError([replacementActionFailure, cleanupFailure]);
		throw cleanupFailure;
	}
	if (replacementActionFailure) throw replacementActionFailure;
	const primaryResult = requireRecord(
		requireRecord(requireRecord(report, "primary"), "first"),
		"result",
	);
	const replacementResult = requireRecord(
		requireRecord(requireRecord(report, "replacement"), "job"),
		"result",
	);
	if (comparable(primaryResult) !== comparable(replacementResult))
		throw new Error("Replacement renderer diverged from the persistent renderer.");
} catch (error) {
	failure = error;
	report = {
		...report,
		status: "failed",
		failure:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: String(error),
	};
} finally {
	if (fixtureServer) {
		fixtureCleanup = await fixtureServer.close();
		if (!fixtureCleanup.clean) {
			const cleanupFailure = new Error(
				`Fixture server cleanup failed: ${JSON.stringify(fixtureCleanup)}`,
			);
			failure = failure ? new AggregateError([failure, cleanupFailure]) : cleanupFailure;
			report = {
				...report,
				status: "failed",
				fixtureCleanupFailure: cleanupFailure.message,
			};
		}
	}
	report["cleanup"] = {
		temporaryOutput: {
			directory: output,
			exists: existsSync(output),
			retainedReport: true,
		},
		fixture: fixtureCleanup,
		primary: primaryCleanup,
		childExit: childExitCleanup,
		replacement: replacementCleanup,
	};
	await Bun.write(reportPath, JSON.stringify(report, null, 2) + "\n");
}

if (failure) throw new Error(`Server rendering proof failed. Disposable report: ${reportPath}`);
globalThis.process.stdout.write(
	`Server rendering proof passed. Disposable report: ${reportPath}\n`,
);
