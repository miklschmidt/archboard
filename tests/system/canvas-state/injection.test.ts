import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, sleep, waitFor } from "./support/http.ts";
import { startInjectionDaemon, type InjectionMessage } from "./support/injection-daemon.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const serverPath = join(repoRoot, "src/server.ts");
const injectionWindowMs = 150;
const noDeliveryMarginMs = injectionWindowMs * 2 + 100;

const directEnvironmentKeys = [
	"CODEX_HOME",
	"LOG_FILE_PATH",
	"ARCHBOARD_VAULT",
	"ARCHBOARD_INJECT",
	"ARCHBOARD_INJECT_LOUD",
	"ARCHBOARD_INJECT_THREAD",
	"ARCHBOARD_INJECT_DEBOUNCE_MS",
	"ARCHBOARD_INJECT_MIN_INTERVAL_MS",
] as const;

interface InjectionStatus {
	success: boolean;
	enabled: boolean;
	armed: boolean;
	loud: boolean;
	refusal: string | null;
	host: string | null;
	connected: boolean;
	lastError: string | null;
	target: { threadId: string | null; reason: string; activeTurnId?: string | null };
	threadsSeen: number;
	pending: number;
	debounceMs: number;
	minIntervalMs: number;
	injected: { quiet: number; loud: number; failed: number };
	lastInjection: { channel: "quiet" | "loud"; threadId: string; at: string; text: string } | null;
}

interface InjectionModule {
	startInjection(host: string): void;
	stopInjection(): void;
	injectionStatus(): { armed: boolean; refusal: string | null };
}

interface ProbeResponse {
	success: boolean;
	channel?: "quiet" | "loud";
	threadId?: string;
	text?: string;
	error?: string;
	status?: InjectionStatus;
}

interface ElementResponse {
	success: boolean;
	element?: Record<string, unknown>;
}

interface InjectItemsParams {
	threadId?: string;
	items?: Array<{
		type?: string;
		role?: string;
		content?: Array<{ type?: string; text?: string }>;
	}>;
}

interface SteerParams {
	threadId?: string;
	expectedTurnId?: string;
	input?: Array<{ type?: string; text?: string }>;
}

const disabledRefusal =
	"ARCHBOARD_INJECT is not set, so the canvas cannot push anything to a Codex thread. " +
	"This is the default: making the agent act is a separate capability from drawing on a board.";
const missingThreadRefusal =
	"ARCHBOARD_INJECT_THREAD is not set, so the canvas has no deterministic Codex task route. " +
	"Nothing will be injected. Set it to the exact task id before starting the canvas.";

const promotedBox = (id: string, name: string, x: number, y: number) => ({
	id,
	type: "rectangle",
	x,
	y,
	width: 220,
	height: 100,
	customData: {
		archboard: { node: id, kind: "service", name },
	},
});

function restoreEnvironment(prior: Map<string, string | undefined>): void {
	for (const key of directEnvironmentKeys) {
		const value = prior.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

describe.serial("injection", () => {
	test("never arms a canvas reachable outside loopback", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-injection-guard-"));
		const prior = new Map(directEnvironmentKeys.map((key) => [key, process.env[key]]));
		const refusals = new Map<string, string | null>();
		let injection: InjectionModule | undefined;
		try {
			process.env.CODEX_HOME = root;
			process.env.LOG_FILE_PATH = join(root, "injection.log");
			process.env.ARCHBOARD_VAULT = join(root, "vault");
			process.env.ARCHBOARD_INJECT = "1";
			delete process.env.ARCHBOARD_INJECT_LOUD;
			delete process.env.ARCHBOARD_INJECT_THREAD;
			delete process.env.ARCHBOARD_INJECT_DEBOUNCE_MS;
			delete process.env.ARCHBOARD_INJECT_MIN_INTERVAL_MS;
			mkdirSync(process.env.ARCHBOARD_VAULT);

			injection = (await import("../../../src/runtime/engine/injection.ts")) as InjectionModule;
			for (const host of ["0.0.0.0", "192.168.1.20"] as const) {
				injection.startInjection(host);
				const status = injection.injectionStatus();
				expect(status.armed).toBeFalse();
				refusals.set(host, status.refusal);
				injection.stopInjection();
			}
		} finally {
			injection?.stopInjection();
			restoreEnvironment(prior);
			rmSync(root, { recursive: true, force: true });
		}

		expect(refusals.get("0.0.0.0")).toBe(
			"The canvas is bound to 0.0.0.0, which is reachable from outside this machine, so injection stays off no matter what ARCHBOARD_INJECT says (ADR 0005: anything that can reach the canvas could otherwise drive the coding agent). Serve the canvas over an SSH tunnel and bind 127.0.0.1, or leave injection disabled on this deployment.",
		);
		expect(refusals.get("192.168.1.20")).toBe(
			"The canvas is bound to 192.168.1.20, which is reachable from outside this machine, so injection stays off no matter what ARCHBOARD_INJECT says (ADR 0005: anything that can reach the canvas could otherwise drive the coding agent). Serve the canvas over an SSH tunnel and bind 127.0.0.1, or leave injection disabled on this deployment.",
		);
		expect(existsSync(root)).toBeFalse();
		for (const key of directEnvironmentKeys) expect(process.env[key]).toBe(prior.get(key));
	});

	test("a loopback canvas stays disabled without the opt-in switch", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-injection-disabled-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const codexHome = join(root, "codex-home");
		mkdirSync(vault);
		mkdirSync(codexHome);
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: {
				CODEX_HOME: codexHome,
				LOG_FILE_PATH: join(root, "canvas.log"),
				ARCHBOARD_INJECT: undefined,
				ARCHBOARD_INJECT_LOUD: undefined,
				ARCHBOARD_INJECT_THREAD: undefined,
				ARCHBOARD_INJECT_DEBOUNCE_MS: undefined,
				ARCHBOARD_INJECT_MIN_INTERVAL_MS: undefined,
			},
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);

		const status = await request<InjectionStatus>("/api/injection");
		expect(status.status).toBe(200);
		expect(status.body).toMatchObject({
			success: true,
			enabled: false,
			armed: false,
			host: "127.0.0.1",
			refusal: disabledRefusal,
		});

		const probe = await request<ProbeResponse>("/api/injection/test", {
			method: "POST",
			body: { note: "must stay off" },
		});
		expect(probe.status).toBe(409);
		expect(probe.body.error).toBe(disabledRefusal);
		expect(probe.body.status?.armed).toBeFalse();
	});

	test("an enabled loopback canvas refuses an ambiguous task route", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-injection-unrouted-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const codexHome = join(root, "codex-home");
		mkdirSync(vault);
		mkdirSync(codexHome);
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: {
				CODEX_HOME: codexHome,
				LOG_FILE_PATH: join(root, "canvas.log"),
				ARCHBOARD_INJECT: "1",
				ARCHBOARD_INJECT_LOUD: undefined,
				ARCHBOARD_INJECT_THREAD: undefined,
				ARCHBOARD_INJECT_DEBOUNCE_MS: String(injectionWindowMs),
				ARCHBOARD_INJECT_MIN_INTERVAL_MS: String(injectionWindowMs),
			},
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);

		const status = await request<InjectionStatus>("/api/injection");
		expect(status.body).toMatchObject({
			success: true,
			enabled: true,
			armed: false,
			host: "127.0.0.1",
			refusal: missingThreadRefusal,
		});
		const probe = await request<ProbeResponse>("/api/injection/test", {
			method: "POST",
			body: { note: "no route" },
		});
		expect(probe.status).toBe(409);
		expect(probe.body.error).toBe(missingThreadRefusal);
		expect(probe.body.status?.target.reason).toBe("none");
	});

	test("an armed canvas uses the app-server protocol and injects only human changes", async () => {
		await using resources = new AsyncDisposableStack();
		const daemon = await startInjectionDaemon();
		resources.defer(() => daemon.dispose());
		const root = mkdtempSync(join(tmpdir(), "archboard-injection-armed-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		mkdirSync(vault);
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: {
				CODEX_HOME: daemon.home,
				LOG_FILE_PATH: join(root, "canvas.log"),
				ARCHBOARD_INJECT: "1",
				ARCHBOARD_INJECT_LOUD: undefined,
				ARCHBOARD_INJECT_THREAD: "thread-live",
				ARCHBOARD_INJECT_DEBOUNCE_MS: String(injectionWindowMs),
				ARCHBOARD_INJECT_MIN_INTERVAL_MS: String(injectionWindowMs),
			},
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);

		const armed = await waitFor(async () => {
			const response = await request<InjectionStatus>("/api/injection");
			return response.body.connected && response.body.target.activeTurnId === "turn-1"
				? response.body
				: undefined;
		}, "the owned canvas to observe the pinned active turn");
		expect(armed).toMatchObject({
			success: true,
			enabled: true,
			armed: true,
			loud: false,
			refusal: null,
			host: "127.0.0.1",
			connected: true,
			target: { threadId: "thread-live", reason: "pinned", activeTurnId: "turn-1" },
			debounceMs: injectionWindowMs,
			minIntervalMs: injectionWindowMs,
		});

		const quiet = await request<ProbeResponse>("/api/injection/test", {
			method: "POST",
			body: { note: "wiring check" },
		});
		expect(quiet.body).toMatchObject({
			success: true,
			channel: "quiet",
			threadId: "thread-live",
		});
		const quietMessage = daemon.received.find(
			(message) => message.method === "thread/inject_items",
		);
		const quietParams = quietMessage?.params as InjectItemsParams | undefined;
		expect(quietParams?.threadId).toBe("thread-live");
		expect(quietParams?.items?.[0]).toMatchObject({
			type: "message",
			role: "developer",
			content: [{ type: "input_text", text: quiet.body.text }],
		});

		const loud = await request<ProbeResponse>("/api/injection/test", {
			method: "POST",
			body: { note: "loud check", loud: true },
		});
		expect(loud.body).toMatchObject({
			success: true,
			channel: "loud",
			threadId: "thread-live",
		});
		const loudMessage = daemon.received.find((message) => message.method === "turn/steer");
		const loudParams = loudMessage?.params as SteerParams | undefined;
		expect(loudParams).toMatchObject({
			threadId: "thread-live",
			expectedTurnId: "turn-1",
			input: [{ type: "text", text: loud.body.text }],
		});
		expect(
			daemon.received.every((message: InjectionMessage) => message.jsonrpc === undefined),
		).toBeTrue();

		await request("/api/boards/new", { method: "POST", body: { board: "inject-board" } });
		const agentWrite = await request<ElementResponse>("/api/elements?board=inject-board", {
			method: "POST",
			doing: "rerouting orders through the queue",
			body: promotedBox("orders", "Orders", 300, 10),
		});
		expect(agentWrite.status).toBe(200);
		expect(agentWrite.body.element?.id).toBe("orders");
		await request("/api/elements?board=inject-board", {
			method: "POST",
			doing: "rerouting orders through the queue",
			body: promotedBox("gateway", "Gateway", 0, 10),
		});
		await request("/api/elements?board=inject-board", {
			method: "POST",
			doing: "rerouting orders through the queue",
			body: promotedBox("database", "Database", 600, 10),
		});
		await request("/api/changes?board=inject-board&since=0");
		const beforeHuman = await request<InjectionStatus>("/api/injection");
		await sleep(noDeliveryMarginMs);
		const afterAgent = await request<InjectionStatus>("/api/injection");
		expect(afterAgent.body.injected.quiet).toBe(beforeHuman.body.injected.quiet);
		expect(afterAgent.body.pending).toBe(0);

		const firstHuman = await request("/api/elements/changes?board=inject-board", {
			method: "POST",
			doing: false,
			body: {
				upserts: [{ ...agentWrite.body.element, y: 1600 }],
				deletes: [],
				origin: "human",
				clientId: "pane-human",
			},
		});
		expect(firstHuman.status).toBe(200);
		const settleRequestedAt = Date.now();
		await request("/api/changes?board=inject-board&since=0");

		const delivered = await waitFor(async () => {
			const response = await request<InjectionStatus>("/api/injection");
			return response.body.injected.quiet === beforeHuman.body.injected.quiet + 1
				? response.body
				: undefined;
		}, "one settled human change to produce one quiet delivery");
		if (!delivered) throw new Error("The delivery condition returned no status.");
		expect(delivered.pending).toBe(0);
		expect(delivered.lastInjection).toMatchObject({
			channel: "quiet",
			threadId: "thread-live",
		});
		expect(delivered.lastInjection?.text).toContain(
			'[archboard] The human changed the board "inject-board"',
		);
		expect(delivered.lastInjection?.text).toContain("Nobody is waiting on you");
		expect(delivered.lastInjection?.text).toContain(
			"An agent was at: rerouting orders through the queue",
		);
		expect(Date.parse(delivered.lastInjection!.at) - settleRequestedAt).toBeGreaterThanOrEqual(
			injectionWindowMs - 10,
		);
		await sleep(noDeliveryMarginMs);
		const once = await request<InjectionStatus>("/api/injection");
		expect(once.body.injected.quiet).toBe(beforeHuman.body.injected.quiet + 1);
	}, 20_000);
});
