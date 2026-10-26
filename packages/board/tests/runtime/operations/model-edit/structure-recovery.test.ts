import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BOARD_LOCK_MS } from "@archboard/timing";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/board/store-write";
import type { ArchitectureModuleEdit } from "@archboard/board/model";
import {
	fixture,
	structureIntent,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";

const actualNow = Date.now;
afterEach(() => {
	Date.now = actualNow;
	disposeFixtures();
});

test.each(["transfer", "remove-and-add"])(
	"interrupted %s recovers its complete file set and affected identities",
	async (kind) => {
		const { root, vault } = fixture();
		const base = await structureIntent(vault, [
			"Shop",
			"Shop#Gateway",
			"Shop#Worker",
			"Shop#Dispatch",
		]);
		const changes: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"] =
			kind === "transfer"
				? [
						{
							type: "edit-relationship",
							subject: "Shop#Dispatch",
							source: "Shop#Worker",
							set: { to: "Shop#Gateway" },
						},
					]
				: [
						{ type: "remove-module", subject: "Shop#Worker" },
						{ type: "add-module", module: { name: "Cache", kind: "service", order: 3 } },
					];
		const input = { ...base, changes };
		const request = join(root, "request.json");
		writeFileSync(request, JSON.stringify(input));
		const originalWorker = readFileSync(join(vault, "worker.module.json"));
		const child = Bun.spawn(
			[
				process.execPath,
				"--preload",
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
				vault,
				request,
			],
			{
				env: { ...process.env, ARCHBOARD_EDIT_CRASH: kind === "transfer" ? "file" : "removed" },
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const output = new Response(child.stdout).text();
		const errors = new Response(child.stderr).text();
		expect(await child.exited, `${await output} ${await errors}`).toBe(86);
		Date.now = () => actualNow() + BOARD_LOCK_MS.lease;
		const blocked = readArchitectureModel(vault);
		expect(blocked).toMatchObject({
			success: false,
			code: "RECOVERY_REQUIRED",
			recovery: {
				subjects: expect.arrayContaining(["Shop#Gateway", "Shop#Worker", "Shop#Dispatch"]),
			},
		});
		if (blocked.success || blocked.recovery === undefined) throw new Error(JSON.stringify(blocked));
		const retained = await readArchitectureCheckpoint(vault, blocked.recovery.checkpoint);
		if (!retained.success) throw new Error(JSON.stringify(retained));
		writeFileSync(join(vault, "worker.module.json"), "foreign bytes\n");
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_CONFLICT",
		});
		expect(readFileSync(join(vault, "worker.module.json"), "utf8")).toBe("foreign bytes\n");
		writeFileSync(join(vault, "worker.module.json"), originalWorker);
		const recovered = await recoverArchitectureModel(vault);
		expect(recovered).toMatchObject({
			success: true,
			operation: { applied: true, subjects: blocked.recovery.subjects },
		});
		if (!recovered.success || recovered.operation === undefined)
			throw new Error(JSON.stringify(recovered));
		expect(readArchitectureModel(vault)).toMatchObject({
			success: true,
			modules: retained.modules,
			relationships: retained.relationships,
			revision: retained.revision,
		});
		expect(await editArchitectureModule(vault, input)).toEqual(recovered.operation);
		expect(await listArchitectureCheckpoints(vault)).toMatchObject({
			success: true,
			checkpoints: [{ id: recovered.operation.checkpoint.id }],
		});
	},
	30000,
);
