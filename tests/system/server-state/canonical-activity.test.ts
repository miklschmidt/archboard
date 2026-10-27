import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { claimArchitectureSubjects, editArchitectureModule } from "@archboard/board/store-write";
import { CLAIM_MS } from "@archboard/timing";
import { ArchitectureClaimResultSchema } from "@archboard/board/model";
import type { AgentActivityMessage } from "@archboard/server-lifecycle/panes";
import { startOwnedServer } from "../support/owned-server.ts";
import { createJsonRequester } from "../support/http.ts";
import { openTestPane, type TestPane } from "../support/pane-websocket.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

function git(root: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", root, ...args]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function fixture(root: string) {
	const vault = join(root, ".archboard/vault");
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	git(root, "init", "--quiet");
	const key = join(root, ".git/activity-key");
	const generated = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]);
	if (generated.exitCode !== 0) throw new Error(generated.stderr.toString());
	for (const args of [
		["config", "gpg.format", "ssh"],
		["config", "user.signingkey", key],
		["config", "commit.gpgsign", "true"],
		["config", "user.name", "Activity Author"],
		["config", "user.email", "activity@example.test"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed activity"],
	]) {
		git(root, ...args);
	}
	const reading = readArchitectureModel(vault);
	if (!reading.success || reading.manifest.current === null)
		throw new Error(JSON.stringify(reading));
	return {
		vault,
		reading,
		target: { model: reading.manifest.id, state: reading.manifest.current.id },
	};
}

async function activity(pane: TestPane, start = 0, vault?: string): Promise<AgentActivityMessage> {
	const message = await pane.waitFor(
		(event) => event.type === "agent_activity" && (vault === undefined || event["vault"] === vault),
		start,
	);
	expect(message).toBeDefined();
	return message as unknown as AgentActivityMessage;
}

test("every pane receives concurrent canonical claims on startup and reconnect", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-activity-"));
	const shown = fixture(join(root, "shown"));
	const { vault, target } = fixture(join(root, "working"));
	const registry = join(root, "registry.json");
	writeFileSync(
		registry,
		JSON.stringify([
			{ name: "shown", root: join(root, "shown"), addedAt: new Date().toISOString() },
			{ name: "working", root: join(root, "working"), addedAt: new Date().toISOString() },
		]),
	);
	const first = await claimArchitectureSubjects(vault, {
		target,
		writer: "gateway-agent",
		reason: "Describe routing",
		subjects: ["Shop#Gateway"],
	});
	const second = await claimArchitectureSubjects(vault, {
		target,
		writer: "worker-agent",
		reason: "Describe work",
		subjects: ["Shop#Worker"],
	});
	if (!first.success || !second.success) throw new Error(JSON.stringify({ first, second }));
	const server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault: shown.vault,
		env: { ARCHBOARD_REPOS: registry },
	});
	const request = createJsonRequester(server);
	let pane: TestPane | undefined;
	try {
		pane = await openTestPane(server.base, request, "activity-pane", 0);
		expect(await activity(pane)).toMatchObject({
			vault,
			activity: [
				{ board: "model:Shop", model: "Shop", claims: [first.claim, second.claim], doing: null },
			],
		});
		await pane.close();
		pane = await openTestPane(server.base, request, "activity-pane", 0);
		expect(await activity(pane)).toMatchObject({
			activity: [{ claims: [first.claim, second.claim] }],
		});
		let start = pane.since();
		await request("/api/architecture/claims/take-back", {
			method: "POST",
			vault,
			body: { claim: first.claim.id, origin: "human" },
		});
		expect(await activity(pane, start)).toMatchObject({ activity: [{ claims: [second.claim] }] });
		start = pane.since();
		await request("/api/architecture/claims/release", {
			method: "POST",
			vault,
			body: { claim: second.claim.id, writer: second.claim.writer },
		});
		expect(await activity(pane, start)).toMatchObject({ vault, activity: [] });
	} finally {
		await pane?.close();
		await server.dispose();
		rmSync(root, { recursive: true, force: true });
	}
});

test("off-screen durable work keeps attribution, refuses failed writes, and clears idle or expired claims", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-activity-work-"));
	const shown = fixture(join(root, "shown"));
	const working = fixture(join(root, "working"));
	const clock = join(root, "clock");
	writeFileSync(clock, "0");
	const server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault: shown.vault,
		preload: join(import.meta.dir, "support/activity-clock-preload.ts"),
		env: { ARCHBOARD_TEST_ACTIVITY_CLOCK: clock },
	});
	const request = createJsonRequester(server);
	let pane: TestPane | undefined;
	try {
		pane = await openTestPane(server.base, request, "global-activity", 0);
		const claim = ArchitectureClaimResultSchema.parse(
			(
				await request("/api/architecture/claims", {
					method: "POST",
					vault: working.vault,
					body: {
						target: working.target,
						writer: "worker",
						reason: "Explain routing",
						subjects: ["Shop#Gateway"],
					},
				})
			).body,
		);
		if (!claim.success) throw new Error(JSON.stringify(claim));
		expect(await activity(pane, 0, working.vault)).toMatchObject({
			vault: working.vault,
			activity: [{ model: "Shop", claims: [claim.claim], doing: null }],
		});
		const input = {
			target: working.target,
			subject: "Shop#Gateway",
			expectedRevision: working.reading.revision,
			operationId: "explain-routing",
			writer: "worker",
			doing: "Explain request routing",
			claim: claim.claim.id,
			description: "Routes authenticated requests.",
		};
		let start = pane.since();
		const edited = await editArchitectureModule(working.vault, input);
		if (!edited.success) throw new Error(JSON.stringify(edited));
		const landed = await activity(pane, start, working.vault);
		expect(landed).toMatchObject({
			vault: working.vault,
			activity: [
				{
					model: "Shop",
					claims: [claim.claim],
					doing: { writer: "worker", doing: input.doing, at: edited.checkpoint.createdAt },
				},
			],
		});
		expect(readArchitectureModel(working.vault)).toMatchObject({ revision: edited.after });
		await pane.close();
		pane = await openTestPane(server.base, request, "global-activity", 0);
		expect(await activity(pane, 0, working.vault)).toEqual(landed);
		start = pane.since();
		expect(
			(
				await request("/api/architecture/module", {
					method: "POST",
					vault: working.vault,
					body: { ...input, operationId: "stale-write", doing: "Must stay hidden" },
				})
			).body,
		).toMatchObject({ success: false, code: "STALE_REVISION" });
		git(join(root, "working"), "config", "gpg.ssh.program", "false");
		expect(
			(
				await request("/api/architecture/module", {
					method: "POST",
					vault: working.vault,
					body: {
						...input,
						operationId: "failed-signature",
						expectedRevision: edited.after,
						doing: "Also hidden",
					},
				})
			).body,
		).toMatchObject({ success: false });
		git(join(root, "working"), "config", "--unset", "gpg.ssh.program");
		expect(pane.seen.slice(start).filter((event) => event.type === "agent_activity")).toEqual([]);
		// A replacement socket receives the tracker's authoritative latest snapshot.
		await pane.close();
		pane = await openTestPane(server.base, request, "global-activity", 0);
		expect(await activity(pane, 0, working.vault)).toEqual(landed);
		start = pane.since();
		await request("/api/architecture/claims/release", {
			method: "POST",
			vault: working.vault,
			body: { claim: claim.claim.id, writer: "worker" },
		});
		expect(await activity(pane, start, working.vault)).toMatchObject({
			activity: [{ claims: [], doing: landed.activity[0]!.doing }],
		});
		expect(
			await pane.waitFor(
				(event) =>
					event.type === "agent_activity" &&
					event["vault"] === working.vault &&
					(event["activity"] as unknown[]).length === 0,
				start,
			),
		).toBeDefined();
		const renewed = ArchitectureClaimResultSchema.parse(
			(
				await request("/api/architecture/claims", {
					method: "POST",
					vault: working.vault,
					body: {
						target: working.target,
						writer: "expiring",
						reason: "Temporary work",
						subjects: ["Shop#Gateway"],
					},
				})
			).body,
		);
		if (!renewed.success) throw new Error(JSON.stringify(renewed));
		start = pane.since();
		writeFileSync(clock, String(CLAIM_MS.default + 1));
		expect(
			await pane.waitFor(
				(event) =>
					event.type === "agent_activity" &&
					event["vault"] === working.vault &&
					(event["activity"] as unknown[]).length === 0,
				start,
			),
		).toBeDefined();
		expect(readArchitectureModel(working.vault)).toMatchObject({ revision: edited.after });
	} finally {
		await pane?.close();
		await server.dispose();
		rmSync(root, { recursive: true, force: true });
	}
});
