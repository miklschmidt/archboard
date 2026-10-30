// The check that the CLI and every open canvas read carries the structure
// warnings of the model it read, and they name the subject and its file.

import { afterAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { DEFAULT_SEMANTIC_POLICY, VaultCheckSchema } from "@archboard/board/policy";
import { mountArchitectureConfigurationRoutes } from "#server/routes/architecture/configuration-routes.ts";

const scratch = mkdtempSync(join(tmpdir(), "archboard-configuration-routes-"));
const vault = join(scratch, ".archboard", "vault");
const listening: Server[] = [];

afterAll(() => {
	for (const http of listening) http.close();
	rmSync(scratch, { recursive: true, force: true });
});

function writeModule(name: string, fields: Record<string, unknown>): void {
	writeFileSync(
		join(vault, `${name}.module.json`),
		JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${name}`,
			name,
			kind: "module",
			order: 0,
			outgoing: [],
			...fields,
		}),
	);
}

test("the semantic check warns on a pass-through container and an unconnected root", async () => {
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Current", name: "Built" },
		}),
	);
	writeModule("Box", {});
	writeModule("Part", {
		parent: "Shop#Box",
		binding: { repo: "github.com/test/shop", path: "src/a.ts" },
	});
	writeModule("Alone", { order: 1 });

	const app = express();
	mountArchitectureConfigurationRoutes(app);
	const http = await new Promise<Server>((resolve) => {
		const started = app.listen(0, "127.0.0.1", () => resolve(started));
	});
	listening.push(http);
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	const answer = await fetch(
		`http://127.0.0.1:${address.port}/api/vault/check?${new URLSearchParams({ vault })}`,
	);
	const { diagnostics } = VaultCheckSchema.parse(await answer.json());
	expect(diagnostics.map(({ severity, code, subject }) => [severity, code, subject?.id])).toEqual([
		["warning", "CONTAINER_PASS_THROUGH", "Shop#Box"],
		["warning", "ROOT_UNCONNECTED", "Shop#Box"],
		["warning", "ROOT_UNCONNECTED", "Shop#Alone"],
	]);
});
