import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
	ArchitectureModelReadSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureEventSchema,
} from "@archboard/board/model";
import { LegacyInventoryReadSchema } from "@archboard/board/migration";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
const repoRoot = resolve(import.meta.dir, "../../.."),
	home = mkdtempSync(join(tmpdir(), "archboard-migration-http-")),
	vault = join(home, ".archboard/vault");
let server: OwnedServer | undefined;
function cli(args: string[], input?: unknown) {
	if (server === undefined) throw new Error("Server unavailable");
	return runServerCli({
		repoRoot,
		server,
		args,
		input: input === undefined ? undefined : JSON.stringify(input),
	});
}
function answer(output: string) {
	const { vault: _vault, ...result } = z.record(z.string(), z.unknown()).parse(JSON.parse(output));
	return result;
}
beforeAll(async () => {
	mkdirSync(vault, { recursive: true });
	for (const args of [
		["init", "--quiet", home],
		["-C", home, "config", "user.name", "Migration Author"],
		["-C", home, "config", "user.email", "migration@example.test"],
		["-C", home, "config", "commit.gpgsign", "false"],
	]) {
		const result = Bun.spawnSync(["git", ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const created = cli(["semantic", "new", "Shop", "--doing", "Describe implemented architecture"], {
		level: "service",
		nodes: [{ name: "API", kind: "module", responsibility: "Accept requests" }],
	});
	if (created.status !== 0) throw new Error(created.stderr);
	const inventory = LegacyInventoryReadSchema.parse(
		answer(cli(["model", "inventory", "--origin", "Shop"]).stdout),
	);
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const saved = cli(["model", "plan", "--doing", "Save explicit choices"], {
		plan: inventory.plan,
		expectedPlan: inventory.planRevision,
	});
	if (saved.status !== 0) throw new Error(saved.stderr);
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});
test("CLI and HTTP share explicit migration authority, strict authorization, exact retry, and durable event completion", async () => {
	const base = server!.base;
	const read = async (query: Record<string, string> = {}) =>
		ArchitectureModelReadSchema.parse(
			await (
				await fetch(`${base}/api/architecture/model?${new URLSearchParams({ vault, ...query })}`)
			).json(),
		);
	expect(await read()).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
	const preview = await read({ preview: "Shop" });
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const request = {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner",
		operationId: "http-cutover",
		writer: "owner",
		doing: "Install explicit migration",
	};
	const controller = new AbortController();
	try {
		const events = await fetch(
			`${base}/api/architecture/events?${new URLSearchParams({ vault })}`,
			{ signal: controller.signal },
		);
		const reader = events.body!.getReader();
		const first = new TextDecoder().decode((await reader.read()).value);
		expect(first).toContain('"LEGACY_AUTHORITY"');
		const endpoint = `${base}/api/architecture/migration/apply`;
		for (const body of [
			{ ...request, vault, authorization: "agent" },
			[],
			{ ...request, vault, extra: true },
		])
			expect(
				(
					await fetch(endpoint, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
					})
				).status,
			).toBe(400);
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...request, vault }),
		});
		expect(response.status).toBe(200);
		const applied = ArchitectureModuleEditResultSchema.parse(await response.json());
		if (!applied.success) throw new Error(JSON.stringify(applied));
		const retried = cli(["model", "migrate"], request);
		expect(retried.status, retried.stderr).toBe(0);
		expect(ArchitectureModuleEditResultSchema.parse(answer(retried.stdout))).toEqual(applied);
		const refused = cli(["model", "migrate"], { ...request, doing: "Another intent" });
		expect(refused.status).toBe(2);
		expect(answer(refused.stdout)).toMatchObject({ code: "OPERATION_REUSED" });
		expect(await read()).toMatchObject({
			success: true,
			manifest: { id: "Shop" },
			revision: applied.after,
		});
		let completion = false;
		while (!completion) {
			const chunk = await reader.read();
			if (chunk.done) throw new Error("Event stream ended before completion");
			for (const line of new TextDecoder()
				.decode(chunk.value)
				.split("\n")
				.filter((v) => v.startsWith("data: "))) {
				const event = ArchitectureEventSchema.parse(JSON.parse(line.slice(6)));
				if (event.type === "architecture_changed") {
					expect(event).toMatchObject({
						model: "Shop",
						reason: "completed",
						revision: applied.after,
						operation: { operationId: request.operationId, applied: true },
					});
					completion = true;
				}
			}
		}
		const legacy = cli(["semantic", "new", "Other", "--doing", "Try legacy authoring"], {
			level: "service",
			nodes: [{ name: "Other", kind: "module", responsibility: "Another module" }],
		});
		expect(legacy.status, legacy.stderr).not.toBe(0);
	} finally {
		controller.abort();
	}
}, 15000);
