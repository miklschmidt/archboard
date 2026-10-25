import { expect, test } from "bun:test";
import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createVoiceAgent, parseTabSessionId } from "@archboard/codex-realtime-voice/server";
import type {
	BrowserCommandLease,
	BrowserSnapshot,
} from "@archboard/codex-realtime-voice/contract";
import { prepareProductionFixture, productionRecords } from "./support/codex-production.ts";

const instructions = {
	coordinator: "Coordinate work in the admitted checkout.\n",
	workhorse: "Complete work in the admitted checkout.\n",
};
const identity = { serviceName: "neutral-proof", threadSource: "neutral-proof" };

/**
 * Fail the test on an unrecoverable agent fault.
 * @param error The fault.
 */
const onFatal = (error: unknown): never => {
	throw error;
};

test("the public factory captures process getters and detaches mutable inputs before startup", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(
			resources,
			join(import.meta.dir, "fixtures/fake-codex-production.ts"),
		);
		writeFileSync(
			fixture.executablePath,
			`${readFileSync(fixture.executablePath, "utf8")}\nrecord({ kind: "captured_process", params: {
				marker: process.env["WORKBENCH_CAPTURE"], path: process.env["PATH"],
				codexHome: process.env["CODEX_HOME"], sqliteHome: process.env["CODEX_SQLITE_HOME"]
			} });\n`,
		);
		const checkout = join(fixture.root, "checkout");
		mkdirSync(checkout);
		const originalPrefix = join(fixture.root, "tools");
		const environment = { WORKBENCH_CAPTURE: "captured", PATH: "/usr/bin" };
		const prefixes = [originalPrefix];
		const secrets = ["captured-diagnostic-secret"];
		const reads = { environment: 0, prefixes: 0, secrets: 0 };
		const workbench = createVoiceAgent({
			storage: { directory: join(fixture.root, "private") },
			codex: {
				executablePath: fixture.executablePath,
				get hostEnvironment() {
					reads.environment += 1;
					return reads.environment === 1 ? environment : undefined;
				},
				get pathPrefixes() {
					reads.prefixes += 1;
					return reads.prefixes === 1 ? prefixes : undefined;
				},
				get diagnosticSecrets() {
					reads.secrets += 1;
					if (reads.secrets !== 1) throw new Error("The process getter was read again.");
					return secrets;
				},
			},
			checkouts: [checkout],
			instructions,
			identity,
			onFatal,
		});
		resources.defer(() => workbench.shutdown());
		expect(reads).toEqual({ environment: 1, prefixes: 1, secrets: 1 });
		environment.WORKBENCH_CAPTURE = "mutated";
		prefixes[0] = "relative-path-is-not-admitted";
		Object.defineProperty(secrets, Symbol.iterator, {
			value: () => {
				throw new Error("The caller changed its diagnostic secrets after installation.");
			},
		});
		expect(await workbench.start()).toMatchObject({ ready: true });
		expect(
			productionRecords(fixture.logPath).find((entry) => entry.kind === "captured_process"),
		).toMatchObject({
			params: {
				marker: "captured",
				path: [originalPrefix, "/usr/bin"].join(delimiter),
				codexHome: join(fixture.root, "private", "codex-home"),
				sqliteHome: join(fixture.root, "private", "sqlite-home"),
			},
		});
		expect(reads).toEqual({ environment: 1, prefixes: 1, secrets: 1 });
	} finally {
		await resources.disposeAsync();
	}
});

test("the public Codex factory starts a standalone host and owns workhorses and voice without a vault", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(
			resources,
			join(import.meta.dir, "fixtures/fake-codex-production.ts"),
		);
		rmSync(join(fixture.root, ".archboard"), { recursive: true, force: true });
		const checkout = join(fixture.root, "checkout");
		mkdirSync(checkout);
		const workbench = createVoiceAgent({
			storage: { directory: join(fixture.root, "private") },
			codex: { executablePath: fixture.executablePath, hostEnvironment: {} },
			checkouts: [checkout],
			instructions,
			identity,
			onFatal,
		});
		resources.defer(() => workbench.shutdown());
		expect(workbench.status()).toMatchObject({ state: "idle", ready: false });
		expect(await workbench.start()).toMatchObject({ state: "ready", ready: true });
		const tab = parseTabSessionId("standalone-proof")!;

		const physical = {};
		const registration = { paneId: "main", tabSessionId: tab, checkout };
		workbench.browser.accept(physical, "browser", registration);
		type Lease = BrowserCommandLease;
		interface Snapshot {
			readonly snapshot: BrowserSnapshot;
		}
		interface Command {
			readonly outcome: string;
			readonly realtimeSessionHandle?: unknown;
		}
		let sequence = 0;
		const request = async <Result>(
			action: string,
			extra: Record<string, unknown> = {},
			instance: object = physical,
		): Promise<Result> => {
			const requestId = `neutral-${++sequence}`;
			let response: unknown;
			await workbench.browser.handle(
				instance,
				"browser",
				{ type: "codex_workbench_request", requestId, action, ...extra },
				{
					send: async (message) => {
						response = message;
					},
				},
			);
			const envelope = z
				.object({ ok: z.boolean(), value: z.unknown(), error: z.string().optional() })
				.parse(response);
			expect(envelope.ok).toBe(true);
			return envelope.value as Result;
		};
		await request<Snapshot>("connect");
		const command = async (name: string, extra: Record<string, unknown> = {}): Promise<Command> => {
			const lease = await request<Lease>("claimLease");
			return request<Command>("command", {
				command: {
					kind: "browser_command",
					command: name,
					commandId: lease.commandId,
					paneId: lease.paneId,
					childId: lease.childId,
					epoch: lease.epoch,
					...extra,
				},
			});
		};
		expect(await command("threadLinkCreate")).toMatchObject({ outcome: "delivered" });
		const linked = (await request<Snapshot>("snapshot")).snapshot.threadLink;
		expect(linked.state).toBe("executable");
		await request<Snapshot>("mediaReady", { ready: true });
		const voice = await command("realtimeStart", { threadId: linked.threadId, sdp: "v=0" });
		expect(voice).toMatchObject({
			outcome: "delivered",
			realtimeAnswer: { sdp: "v=0\r\ns=controlled-answer-sdp\r\n" },
		});
		expect(
			await command("realtimeStop", {
				threadId: linked.threadId,
				realtimeSessionHandle: voice.realtimeSessionHandle,
			}),
		).toMatchObject({ outcome: "delivered" });
		const starts = productionRecords(fixture.logPath).filter(
			(entry) => entry.kind === "frame" && entry.method === "thread/start",
		);
		expect(starts.map((entry) => entry.params?.["cwd"])).toEqual([
			join(fixture.root, "private", "owner", "coordinator"),
			checkout,
		]);
		expect(starts[0]?.params?.["dynamicTools"]).toHaveLength(2);
		expect(starts[1]?.params?.["dynamicTools"]).toHaveLength(1);
		const replacement = {};
		workbench.browser.accept(replacement, "browser", registration);
		await request<Snapshot>("connect", {}, replacement);
		await workbench.browser.close(physical, "browser");
		expect(
			(await request<Snapshot>("snapshot", {}, replacement)).snapshot.threadLink.threadId,
		).toBe(linked.threadId);
		expect(existsSync(join(checkout, ".archboard"))).toBe(false);
		expect(existsSync(join(fixture.root, ".archboard"))).toBe(false);
		await workbench.shutdown();
		expect(workbench.status()).toMatchObject({ ready: false, childPid: null });
		expect(await workbench.start()).toMatchObject({ ready: true });
		const restarted = {};
		workbench.browser.accept(restarted, "browser", registration);
		expect((await request<Snapshot>("connect", {}, restarted)).snapshot.threadLink.state).not.toBe(
			"executable",
		);
		await workbench.shutdown();
	} finally {
		await resources.disposeAsync();
	}
});
