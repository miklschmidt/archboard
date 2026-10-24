import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createCodexWorkbench, parseTabSessionId } from "@archboard/agent-workbench/server";
import { createWorkbenchThreadProfile } from "@archboard/agent-workbench/runtime";
import { prepareProductionFixture, productionRecords } from "./support/codex-production.ts";

const instructions = {
	coordinator: createWorkbenchThreadProfile({
		serviceName: "neutral-proof",
		threadSource: "neutral-proof",
		role: "coordinator",
		domainInstructions: "Coordinate work in the admitted checkout.\n",
		dynamicTools: [],
	}),
	workhorse: createWorkbenchThreadProfile({
		serviceName: "neutral-proof",
		threadSource: "neutral-proof",
		role: "workhorse",
		domainInstructions: "Complete work in the admitted checkout.\n",
		dynamicTools: [],
	}),
};

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
		const workbench = createCodexWorkbench({
			storage: { rootDirectory: join(fixture.root, "private") },
			process: { executablePath: fixture.executablePath, hostEnvironment: {} },
			host: { instructions, allowedCheckouts: [checkout] },
		});
		resources.defer(() => workbench.shutdown());
		expect(workbench.snapshot()).toMatchObject({ state: "idle", ready: false });
		expect(await workbench.start()).toMatchObject({ state: "ready", ready: true });
		const tab = parseTabSessionId("standalone-proof")!;
		const browser = workbench.connect("browser", "main", tab, checkout, {});
		const command = (name: string, extra: Record<string, unknown> = {}) => {
			const lease = browser.claimLease();
			return browser.command({
				kind: "browser_command",
				command: name,
				commandId: lease.commandId,
				paneId: lease.paneId,
				childId: lease.childId,
				epoch: lease.epoch,
				...extra,
			});
		};
		expect(await command("threadLinkCreate")).toMatchObject({ outcome: "delivered" });
		const linked = browser.snapshot().snapshot.threadLink;
		expect(linked.state).toBe("executable");
		expect(workbench.session(tab).workhorses.size).toBe(1);
		const workhorse = workbench.session(tab).workhorses.get(checkout)!;
		browser.setMediaReady(true);
		const voice = await command("realtimeStart", { threadId: linked.threadId, sdp: "v=0" });
		expect(voice).toMatchObject({
			outcome: "delivered",
			realtimeAnswer: { sdp: "v=0\r\ns=controlled-answer-sdp\r\n" },
		});
		expect(workbench.session(tab).components.realtime.generation()).not.toBeNull();
		expect(
			await command("realtimeStop", {
				threadId: linked.threadId,
				realtimeSessionHandle: voice.realtimeSessionHandle,
			}),
		).toMatchObject({ outcome: "delivered" });
		expect(workbench.session(tab).components.realtime.generation()).toBeNull();
		expect(workhorse.components.workhorse.snapshot().threadId).toBe(linked.threadId);
		const starts = productionRecords(fixture.logPath).filter(
			(entry) => entry.kind === "frame" && entry.method === "thread/start",
		);
		expect(starts.map((entry) => entry.params?.["cwd"])).toEqual([
			join(fixture.root, "private", "owner", "coordinator"),
			checkout,
		]);
		expect(starts[0]?.params?.["dynamicTools"]).toHaveLength(2);
		expect(starts[1]?.params?.["dynamicTools"]).toHaveLength(1);
		const replacement = workbench.connect("browser", "main", tab, checkout, {});
		await browser.close();
		expect(replacement.snapshot().snapshot.threadLink.threadId).toBe(linked.threadId);
		expect(existsSync(join(checkout, ".archboard"))).toBe(false);
		expect(existsSync(join(fixture.root, ".archboard"))).toBe(false);
		await workbench.shutdown();
		expect(workbench.snapshot()).toMatchObject({ ready: false, childPid: null });
		expect(await workbench.start()).toMatchObject({ ready: true });
		expect(workbench.sessions()).toHaveLength(0);
		await workbench.shutdown();
	} finally {
		await resources.disposeAsync();
	}
});
