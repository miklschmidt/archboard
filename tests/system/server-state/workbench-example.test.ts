import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import { processExists } from "../support/owned-server.ts";
import { TEST_SERVER_SHUTDOWN_TIMEOUT_MS } from "../support/timing.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionLeaseTarget,
	productionRecords,
	productionSnapshot,
	type ApplicationSocket,
} from "./support/codex-production.ts";
import { waitFor } from "./support/http.ts";

/**
 * Spawn the example's actual process entry with private inputs.
 * @param resources Owns the process until the test ends.
 * @param fixture The root-controlled Codex executable and private directory.
 * @returns Readiness observation and an idempotent process stop.
 */
function startExampleProcess(
	resources: AsyncDisposableStack,
	fixture: ReturnType<typeof prepareProductionFixture>,
) {
	const checkout = join(fixture.root, "checkout");
	const browser = join(fixture.root, "browser");
	mkdirSync(checkout);
	mkdirSync(browser);
	for (const file of ["index.html", "app.js", "app.css"]) writeFileSync(join(browser, file), file);
	const initialized = Bun.spawnSync(["git", "init", checkout], {
		stdout: "ignore",
		stderr: "pipe",
	});
	expect(initialized.exitCode).toBe(0);
	const child = spawn(
		process.execPath,
		[
			join(import.meta.dir, "../../../apps/workbench-example/src/server.ts"),
			"--checkout",
			checkout,
			"--state",
			join(fixture.root, "private"),
			"--codex",
			fixture.executablePath,
			"--browser-directory",
			browser,
			"--port",
			"0",
		],
		{
			cwd: checkout,
			env: { PATH: process.env["PATH"], HOME: fixture.root, TMPDIR: fixture.root },
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderr = "";
	let spawnError: Error | undefined;
	child.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});
	child.once("error", (error) => {
		spawnError = error;
	});
	let stopping: Promise<void> | undefined;
	const stop = (): Promise<void> =>
		(stopping ??= new Promise<void>((resolve, reject) => {
			if (child.exitCode !== null || child.signalCode !== null) {
				resolve();
				return;
			}
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error(`The example did not stop.\n${stderr}`));
			}, TEST_SERVER_SHUTDOWN_TIMEOUT_MS);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
			child.kill("SIGTERM");
		}));
	resources.defer(stop);
	return {
		checkout: realpathSync(checkout),
		stop,
		child,
		browser,
		/** Observe readiness from the actual process output. */
		async ready() {
			// Startup belongs to another process, so readiness requires observing its output.
			const ready = await waitFor(() => {
				if (spawnError) throw spawnError;
				if (child.exitCode !== null)
					throw new Error(`Example exited ${child.exitCode}.\n${stderr}`);
				const line = stdout
					.split("\n")
					.find((candidate) => candidate.startsWith('{"type":"workbench_example_ready"'));
				return line === undefined ? undefined : (JSON.parse(line) as { url: string });
			}, "the example process readiness signal");
			if (ready === undefined) throw new Error(`The example did not report readiness.\n${stderr}`);
			return ready;
		},
	};
}

/**
 * Read the core snapshot through the example's public socket.
 * @param socket The browser connection.
 * @returns The current browser snapshot.
 */
async function snapshot(socket: ApplicationSocket): Promise<BrowserSnapshot> {
	return productionSnapshot(await socket.request("snapshot")) as unknown as BrowserSnapshot;
}

/**
 * Claim the current command lease and send one core command unchanged.
 * @param socket The browser connection.
 * @param name The core command name.
 * @param fields The command's inputs.
 * @returns The core delivery response.
 */
async function command(
	socket: ApplicationSocket,
	name: string,
	fields: Record<string, unknown> = {},
) {
	return socket.request("command", {
		command: {
			kind: "browser_command",
			command: name,
			...productionLeaseTarget(await socket.request("claimLease")),
			...fields,
		},
	});
}

test("the example entry serves a vault-free workbench with isolated tabs, approvals, voice and independent stops", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(
			resources,
			join(import.meta.dir, "fixtures/fake-codex-production.ts"),
		);
		rmSync(join(fixture.root, ".archboard"), { recursive: true });
		writeFileSync(fixture.controlPath, JSON.stringify({ ordinaryOnly: true }));
		const example = startExampleProcess(resources, fixture);
		const host = { ...example, ...(await example.ready()) };
		const configResponse = await fetch(new URL("/api/config", host.url));
		expect(await configResponse.json()).toEqual({
			checkout: { label: "checkout", path: host.checkout },
			socketPath: "/api/workbench",
		});
		for (const [path, file] of [
			["/", "index.html"],
			["/app.js", "app.js"],
			["/app.css", "app.css"],
		]) {
			expect(await (await fetch(new URL(path!, host.url))).text()).toBe(
				readFileSync(join(host.browser, file!), "utf8"),
			);
		}
		expect(
			(
				await fetch(new URL("/api/config", host.url), {
					headers: { Origin: "https://other.example" },
				})
			).status,
		).toBe(403);
		expect((await fetch(new URL("/api/conversation", host.url), { method: "POST" })).status).toBe(
			405,
		);
		const rejected = new WebSocket(`${host.url.replace("http:", "ws:")}/api/workbench?paneId=main`);
		rejected.on("error", () => undefined);
		await new Promise<void>((resolve) => {
			rejected.once("error", () => resolve());
		});
		expect(rejected.readyState).not.toBe(WebSocket.OPEN);
		const open = async (tab: string) => {
			const endpoint = new URL("/api/workbench", host.url);
			endpoint.searchParams.set("tabSessionId", tab);
			endpoint.searchParams.set("paneId", "main");
			const socket = await openApplicationSocket(host.url, tab, { endpoint: endpoint.href });
			resources.defer(() => socket.close());
			expect(await socket.request("connect")).toMatchObject({ ok: true });
			return socket;
		};
		const first = await open("example-first");
		expect(await command(first, "threadLinkCreate")).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const linked = await snapshot(first);
		expect(linked.threadLink.state).toBe("executable");
		if (linked.threadLink.state !== "executable")
			throw new Error("The example has no executable conversation.");
		const threadId = linked.threadLink.threadId;
		expect(linked.coordinator.threadId).not.toBe(threadId);
		const second = await open("example-second");
		expect((await snapshot(second)).threadLink.state).toBe("unbound");
		expect(await command(second, "threadLinkCreate")).toMatchObject({
			value: { outcome: "delivered" },
		});
		const other = await snapshot(second);
		expect(other.threadLink.threadId).not.toBe(threadId);
		expect(other.coordinator.threadId).not.toBe(linked.coordinator.threadId);
		const replacement = await open("example-first");
		await expect(first.request("snapshot")).rejects.toThrow();
		await first.close();
		expect((await snapshot(replacement)).threadLink.threadId).toBe(threadId);
		expect(
			await command(replacement, "start", { threadId, prompt: "Finish the example proof." }),
		).toMatchObject({ value: { outcome: "delivered" } });
		const pending = await waitFor(
			async () => (await snapshot(replacement)).approvals[0],
			"the example ordinary approval",
		);
		if (pending === undefined) throw new Error("The ordinary approval disappeared.");
		expect((await snapshot(second)).approvals).toHaveLength(0);
		expect(
			await command(replacement, "approvalRespond", {
				requestId: pending.requestId,
				approvalId: pending.approvalId,
				response: { approvalKind: "command_execution", decision: "accept" },
			}),
		).toMatchObject({ value: { outcome: "delivered" } });
		await waitFor(
			() =>
				productionRecords(fixture.logPath).some(
					(record) =>
						record.kind === "reverse_response" && record.frame?.id === "ordinary-request-1",
				),
			"the real ordinary approval response",
		);
		expect(await replacement.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		const voice = await command(replacement, "realtimeStart", { threadId, sdp: "v=0" });
		expect(voice).toMatchObject({
			value: {
				outcome: "delivered",
				realtimeAnswer: { sdp: "v=0\r\ns=controlled-answer-sdp\r\n" },
			},
		});
		expect(
			await command(replacement, "realtimeStop", {
				threadId,
				realtimeSessionHandle: voice.value?.["realtimeSessionHandle"],
			}),
		).toMatchObject({ value: { outcome: "delivered" } });
		expect((await snapshot(replacement)).timeline?.turns.at(-1)?.status).toBe("inProgress");
		expect(
			productionRecords(fixture.logPath).filter((record) => record.method === "turn/interrupt"),
		).toHaveLength(0);
		writeFileSync(
			fixture.controlPath,
			JSON.stringify({ ordinaryOnly: true, completeWorkhorseTurn: true }),
		);
		await waitFor(
			async () => (await snapshot(replacement)).timeline?.turns.at(-1)?.status === "completed",
			"workhorse completion after voice stop",
		);
		const finished = await snapshot(replacement);
		expect(finished.timeline?.turns.at(-1)?.items).toContainEqual(
			expect.objectContaining({ media: "prompt", text: "Finish the example proof." }),
		);
		expect((await snapshot(second)).timeline?.turns ?? []).toHaveLength(0);
		expect(finished.timeline?.threadId).toBe(threadId);
		expect(finished.coordinatorTimeline?.turns ?? []).toHaveLength(0);
		writeFileSync(fixture.controlPath, JSON.stringify({ ordinaryOnly: true }));
		const restarted = await command(replacement, "start", {
			threadId,
			prompt: "Wait for an independent stop.",
		});
		expect(restarted).toMatchObject({ value: { outcome: "delivered" } });
		const voiceAgain = await command(replacement, "realtimeStart", { threadId, sdp: "v=0" });
		expect(voiceAgain).toMatchObject({ value: { outcome: "delivered" } });
		expect(
			await command(replacement, "interrupt", {
				threadId,
				turnId: restarted.value?.["turnId"],
			}),
		).toMatchObject({ value: { outcome: "delivered" } });
		await waitFor(
			async () => (await snapshot(replacement)).timeline?.turns.at(-1)?.status === "interrupted",
			"the independent workhorse interrupt",
		);
		expect((await snapshot(replacement)).voice.state).toBe("active");
		const starts = productionRecords(fixture.logPath).filter(
			(record) => record.kind === "frame" && record.method === "thread/start",
		);
		expect(starts[0]?.params?.["cwd"]).toBe(join(fixture.root, "private", "owner", "coordinator"));
		expect(starts[1]?.params?.["cwd"]).toBe(host.checkout);
		expect(existsSync(join(host.checkout, ".archboard"))).toBe(false);
		expect(existsSync(join(fixture.root, ".archboard"))).toBe(false);
		const childPid = productionRecords(fixture.logPath).find(
			(record) => record.kind === "app_server_spawn",
		)!.pid!;
		await host.stop();
		expect(host.child.exitCode).toBe(0);
		expect(replacement.socket.readyState).toBe(WebSocket.CLOSED);
		expect(second.socket.readyState).toBe(WebSocket.CLOSED);
		await waitFor(() => !processExists(childPid), "the example's private Codex child to exit");
	} finally {
		await resources.disposeAsync();
	}
});

test("SIGTERM stops the example's private child before startup becomes ready", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(
			resources,
			join(import.meta.dir, "fixtures/fake-codex-production.ts"),
		);
		writeFileSync(fixture.controlPath, JSON.stringify({ holdInitialize: true }));
		const host = startExampleProcess(resources, fixture);
		// The controlled child records that startup is pending before the signal arrives.
		await waitFor(
			() => productionRecords(fixture.logPath).some((record) => record.kind === "initialize_held"),
			"the example's pending Codex initialization",
		);
		const childPid = productionRecords(fixture.logPath).find(
			(record) => record.kind === "app_server_spawn",
		)!.pid!;
		await host.stop();
		expect(host.child.exitCode).toBe(0);
		expect(processExists(childPid)).toBe(false);
	} finally {
		await resources.disposeAsync();
	}
});
