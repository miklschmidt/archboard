import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { createServer, type ViteDevServer } from "vite";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { projectPreviewSnapshot } from "../src/ui/board-preview/index.js";
import { readNote } from "../src/runtime/engine/board-io.js";
import { applyElementInput } from "../src/runtime/engine/apply-element-input.js";
import type { ServerElement } from "../src/runtime/engine/types.js";
import { derivedId, isBlockId } from "../src/shared/ids/ids.js";

const root = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(root, "docs/design/server-rendering-boundary-fixtures");
const fixtureNote = join(fixtureRoot, "board.excalidraw.md");
const chromium = "/run/current-system/sw/bin/chromium";
const setsid = "/run/current-system/sw/bin/setsid";
const jobTimeoutMs = 20_000;
const cleanupTimeoutMs = 5_000;

type JsonRecord = Record<string, unknown>;

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

interface CdpEvent {
	method: string;
	params: JsonRecord;
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
				reject(new Error(`DevTools ${method} timed out after ${timeoutMs} ms.`));
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
		if (answer.exceptionDetails)
			throw new Error(`Page evaluation failed: ${JSON.stringify(answer.exceptionDetails)}`);
		return (answer.result as JsonRecord | undefined)?.value;
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
					const response = event.params.response as JsonRecord | undefined;
					return typeof response?.status === "number" && response.status >= 400;
				}
				return event.method === "Log.entryAdded";
			})
			.slice(-30)
			.map((event) => {
				const requestId = event.params.requestId;
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
			const request = params.request as JsonRecord | undefined;
			if (typeof params.requestId === "string" && typeof request?.url === "string")
				this.#requests.set(params.requestId, request.url);
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
	survivors: number[];
	clean: boolean;
	profile: string;
	profileRemoved: boolean;
	stdout: string;
	stderr: string;
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

class RendererSession {
	readonly profile = mkdtempSync(join(tmpdir(), "archboard-server-rendering-chromium-"));
	readonly port = reserveLoopbackPort();
	readonly startedAt = performance.now();
	readonly child = Bun.spawn({
		cmd: [
			setsid,
			chromium,
			"--headless=new",
			"--disable-gpu",
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-crash-reporter",
			`--user-data-dir=${this.profile}`,
			`--remote-debugging-port=${this.port}`,
			"about:blank",
		],
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	readonly stdout = new Response(pipe(this.child.stdout)).text();
	readonly stderr = new Response(pipe(this.child.stderr)).text();
	#cdp: Cdp | null = null;
	#running = false;
	#maxConcurrentJobs = 0;
	readonly #observed = new Set<number>();

	async start(url: string): Promise<{ startup: MemorySample; startupMs: number }> {
		const base = `http://127.0.0.1:${this.port}`;
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			if (this.child.exitCode !== null)
				throw new Error(
					`Chromium exited during startup (${this.child.exitCode}): ${snippet(await this.stderr)}`,
				);
			try {
				if ((await fetch(`${base}/json/version`)).ok) break;
			} catch {
				// The private DevTools server has not bound its loopback port yet.
			}
			await Bun.sleep(50);
		}
		if (this.child.exitCode !== null || !(await fetch(`${base}/json/version`)).ok)
			throw new Error("Chromium did not bind its private DevTools loopback port within 5 seconds.");
		const startupPids = ownedProcessIds(this.child.pid);
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

	async runJob(
		name: string,
		mode: "normal" | "missing-image" | "stall" = "normal",
	): Promise<JobEvidence> {
		if (!this.#cdp) throw new Error("Renderer has not started.");
		if (this.child.exitCode !== null)
			throw new Error(`Renderer ${name} cannot run: Chromium exited (${this.child.exitCode}).`);
		if (this.#running) throw new Error(`Renderer already owns a job; refused concurrent ${name}.`);
		this.#running = true;
		this.#maxConcurrentJobs = Math.max(this.#maxConcurrentJobs, 1);
		const startedAt = performance.now();
		try {
			const value = await this.#cdp.evaluate(
				`window.runArchboardRendererProof?.(${JSON.stringify(mode)})`,
				jobTimeoutMs,
			);
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
			throw new Error(
				`Renderer ${name} failed in phase ${String(phase.phase ?? "unknown")}: ${(error as Error).message}; ` +
					`page diagnostics=${JSON.stringify(this.#cdp.diagnostics())}; proof=${JSON.stringify(phase)}`,
				{ cause: error },
			);
		} finally {
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

	async shutdown(): Promise<CleanupAudit> {
		this.#cdp?.close();
		this.observe(ownedProcessIds(this.child.pid));
		const pids = [...this.#observed].toSorted((left, right) => left - right);
		const cleanupStartedAt = Date.now();
		if (this.child.exitCode === null) {
			try {
				globalThis.process.kill(-this.child.pid, "SIGTERM");
			} catch {
				// The group can exit between observation and termination.
			}
			await Promise.race([this.child.exited, Bun.sleep(Math.max(0, cleanupTimeoutMs - 1_000))]);
			if (this.child.exitCode === null) {
				try {
					globalThis.process.kill(-this.child.pid, "SIGKILL");
				} catch {
					// The group can exit between escalation and the signal.
				}
				await Promise.race([this.child.exited, Bun.sleep(1_000)]);
			}
		}
		const deadline = cleanupStartedAt + cleanupTimeoutMs;
		let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		while (survivors.length > 0 && Date.now() < deadline) {
			await Bun.sleep(50);
			survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		}
		const clean = survivors.length === 0;
		if (clean) rmSync(this.profile, { recursive: true, force: true });
		return {
			pids,
			survivors,
			clean,
			profile: this.profile,
			profileRemoved: clean && !existsSync(this.profile),
			stdout: snippet(await this.stdout),
			stderr: snippet(await this.stderr),
		};
	}

	private async waitForReady(): Promise<void> {
		const deadline = Date.now() + jobTimeoutMs;
		let state: JsonRecord = { phase: "unavailable" };
		while (Date.now() < deadline) {
			state = await this.proofState();
			if (state.phase === "ready") return;
			if (state.status === "failed") break;
			await Bun.sleep(50);
		}
		throw new Error(
			`Renderer fixture did not become ready in phase ${String(state.phase ?? "unknown")}; ` +
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
			file.id !== id ||
			file.mimeType !== "image/png" ||
			typeof file.dataURL !== "string" ||
			!file.dataURL.startsWith("data:image/png;base64,") ||
			typeof file.created !== "number"
		)
			throw new Error(`Persisted file ${id} is not a complete PNG export file.`);
	}
	return files as unknown as BinaryFiles;
}

function assertPng(result: JsonRecord): void {
	const png = requireRecord(result, "png");
	if (requireNumber(png.bytes, "PNG byte count is missing.") < 1)
		throw new Error("PNG export is empty.");
	requireSha256(png.hash, "PNG SHA-256 is missing.");
	requireBoolean(png.isPng, "PNG signature is invalid.");
	const semantics = requireRecord(png, "semantics");
	const width = requireNumber(semantics.width, "PNG width is missing.");
	const height = requireNumber(semantics.height, "PNG height is missing.");
	if (width < 500 || height < 300)
		throw new Error(`PNG dimensions are implausible: ${width}x${height}.`);
	const colors = requireRecord(semantics, "colors");
	const background = requireRecord(colors, "background");
	const service = requireRecord(colors, "service");
	const store = requireRecord(colors, "store");
	const decision = requireRecord(colors, "decision");
	for (const [name, color] of Object.entries({ background, service, store, decision })) {
		if (requireNumber(color.count, `PNG ${name} colour count is missing.`) < 100)
			throw new Error(`PNG lacks visible ${name} colour pixels.`);
	}
	if (
		requireNumber(service.maxX, "PNG service bounds missing.") >=
			requireNumber(store.minX, "PNG store bounds missing.") ||
		requireNumber(decision.minY, "PNG decision bounds missing.") <=
			requireNumber(service.maxY, "PNG service bounds missing.")
	)
		throw new Error("PNG fixture regions are not in the expected service, store, decision layout.");
}

function assertSvg(result: JsonRecord): void {
	const svg = requireRecord(result, "svg");
	if (requireNumber(svg.bytes, "SVG byte count is missing.") < 1)
		throw new Error("SVG export is empty.");
	requireSha256(svg.hash, "SVG SHA-256 is missing.");
	const semantics = requireRecord(svg, "semantics");
	if (semantics.root !== "svg") throw new Error("SVG root is not svg.");
	requireBoolean(semantics.background, "SVG lacks the persisted background.");
	if (
		!Array.isArray(semantics.fills) ||
		semantics.fills.some(
			(fill) => !fill || typeof fill !== "object" || (fill as JsonRecord).present !== true,
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
	if (!Array.isArray(semantics.shapes) || semantics.shapes.length < 8)
		throw new Error("SVG does not contain enough native rendered shapes.");
}

function assertMermaid(result: JsonRecord): void {
	const mermaid = requireRecord(result, "mermaid");
	if (requireNumber(mermaid.elementCount, "Mermaid element count is missing.") < 5)
		throw new Error("Mermaid conversion returned too few elements.");
	if (result.invalidMermaid !== "Error")
		throw new Error("Malformed Mermaid did not reject with Error.");
	const semantics = requireRecord(mermaid, "elements");
	const nodes = semantics.nodes;
	const edges = semantics.edges;
	if (!Array.isArray(nodes) || !Array.isArray(edges))
		throw new Error("Mermaid graph summary is absent.");
	const labels = nodes.map((node) => (node as JsonRecord).label).toSorted();
	const connections = edges
		.map((edge) => `${String((edge as JsonRecord).from)}>${String((edge as JsonRecord).to)}`)
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
	if ("error" in result) throw new Error(`Browser probe failed: ${JSON.stringify(result.error)}`);
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
		!Array.isArray(service.boundElements) ||
		!service.boundElements.some((binding) => (binding as JsonRecord).id === "label") ||
		label.containerId !== "svc" ||
		(arrow.startBinding as JsonRecord | undefined)?.elementId !== "svc" ||
		(arrow.endBinding as JsonRecord | undefined)?.elementId !== "store"
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

async function startFixtureServer(
	input: JsonRecord,
): Promise<{ server: ViteDevServer; url: string }> {
	const port = reserveLoopbackPort();
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
	await server.listen();
	return { server, url: `http://127.0.0.1:${port}/chromium.html` };
}

async function runInboundMermaid(result: JsonRecord): Promise<JsonRecord> {
	const mermaid = requireRecord(result, "mermaid");
	const raw = mermaid.rawElements;
	if (!Array.isArray(raw)) throw new Error("Browser Mermaid result has no element array.");
	const ids = new Map<string, string>();
	const used = new Set<string>();
	for (const element of raw) {
		const source = (element as JsonRecord).id;
		if (typeof source !== "string") throw new Error("Mermaid element has no source id.");
		const id = derivedId(`mermaid:${source}`, used);
		used.add(id);
		ids.set(source, id);
	}
	const input = raw.map((element) => {
		const source = element as JsonRecord;
		const start = source.start as JsonRecord | undefined;
		const end = source.end as JsonRecord | undefined;
		return {
			...source,
			id: ids.get(source.id as string),
			...(start && typeof start.id === "string" ? { start: { id: ids.get(start.id) } } : {}),
			...(end && typeof end.id === "string" ? { end: { id: ids.get(end.id) } } : {}),
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

const output = ownedOutputDirectory(Bun.argv.slice(2));
const reportPath = join(output, "report.json");
let fixtureServer: ViteDevServer | null = null;
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
	const fixture = await startFixtureServer(input);
	fixtureServer = fixture.server;
	const primary = new RendererSession();
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
		let timeout: string | null = null;
		try {
			await primary.runJob("intentional-timeout", "stall");
		} catch (error) {
			timeout = (error as Error).message;
		}
		if (!timeout?.includes("intentional-timeout"))
			throw new Error(
				`Timed-out renderer did not report its named phase: ${timeout ?? "no error"}`,
			);
		report = {
			status: "passed",
			backend: "isolated server-owned headless Chromium",
			browserClient: "none",
			output: { directory: output, owner: "probe", disposable: true },
			malformedBoard,
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
	const childExit = new RendererSession();
	let childExitActionFailure: unknown = null;
	try {
		const startup = await childExit.start(fixture.url);
		globalThis.process.kill(-childExit.child.pid, "SIGTERM");
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
		report.childExit = { startup, exitCode: childExit.child.exitCode, rejection };
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
	const replacement = new RendererSession();
	let replacementActionFailure: unknown = null;
	try {
		const startup = await replacement.start(fixture.url);
		const job = await replacement.runJob("replacement");
		assertSemantics(job.result);
		report.replacement = {
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
	if (fixtureServer) await fixtureServer.close();
	report.cleanup = {
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
