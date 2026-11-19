// A drawing route whose renderer core is stale answers with the refusal's code and the command
// that rebuilds the core, not "Internal server error" (TASK-655). The renderer is the stand-in:
// it refuses as a core built from other sources does, and the server knows the refusal only by
// its code.

import { afterAll, expect, mock, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { defaultSemanticPolicy } from "@archboard/model-contract";

const STALE =
	"The renderer core in /checkout/core was built from other sources (aaaa) than /checkout holds (bbbb). Run `bun run build:core` in /checkout, with the tools that its INSTALL.md names.";

const renderer = await import("@archboard/renderer/bun");
await mock.module("@archboard/renderer/bun", () => ({
	...renderer,
	/**
	 * Refuse as a stale core does.
	 * @returns Never; the refusal.
	 */
	renderArchitecture: () =>
		Promise.reject(Object.assign(new Error(STALE), { code: "CORE_BUILD_STALE" })),
}));
const [{ mountArchitectureFlowRoutes }, { mountServiceRoutes }] = await Promise.all([
	import("#server/http/handlers/reads/routes/flow-routes.ts"),
	import("#server/http/handlers/reads/routes/service-routes.ts"),
]);

const scratch = mkdtempSync(join(tmpdir(), "archboard-flow-routes-"));
const vault = join(scratch, ".archboard", "vault");
const listening: Server[] = [];

afterAll(() => {
	for (const http of listening) http.close();
	rmSync(scratch, { recursive: true, force: true });
});

test("a drawing route answers a stale renderer core with its code and the command that rebuilds it", async () => {
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(defaultSemanticPolicy()));
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Current", name: "Built" },
		}),
	);
	writeFileSync(
		join(vault, "Box.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Box",
			name: "Box",
			kind: "module",
			order: 0,
			outgoing: [],
		}),
	);

	const app = express();
	mountArchitectureFlowRoutes(app);
	mountServiceRoutes(app);
	const http = await new Promise<Server>((resolve) => {
		const started = app.listen(0, "127.0.0.1", () => resolve(started));
	});
	listening.push(http);
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	const answer = await fetch(
		`http://127.0.0.1:${address.port}/api/architecture/render?${new URLSearchParams({ vault })}`,
	);
	const body: unknown = await answer.json();
	expect(body).toMatchObject({ success: false, code: "CORE_BUILD_STALE", error: STALE });
	// The CLI prints a refusal's code from its diagnostics.
	expect(body).toHaveProperty(["diagnostics", 0, "code"], "CORE_BUILD_STALE");
});
