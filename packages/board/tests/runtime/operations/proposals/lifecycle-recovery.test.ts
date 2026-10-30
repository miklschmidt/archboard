import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_LOCK_MS } from "@archboard/timing";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal } from "#tests/runtime/operations/proposals/fixture.ts";

const now = Date.now;
afterEach(() => {
	Date.now = now;
	disposeFixtures();
});

test.each([
	["adopt", "proposal-removed"],
	["adopt", "file"],
	["shelve", "proposal-removed"],
] as const)(
	"interrupted %s after %s recovers complete state and exactly one lifecycle event",
	async (type, point) => {
		const { root, vault } = fixture();
		const created = await proposal(vault, "Queue", "Current", [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
		]);
		const input = {
			...(await request(vault, created.target.state!)),
			proposal: { type, reason: "Record this decision." },
			changes: [],
		};
		const file = join(root, "lifecycle-request.json");
		writeFileSync(file, JSON.stringify(input));
		const child = Bun.spawn(
			[
				process.execPath,
				"--preload",
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
				vault,
				file,
			],
			{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: point }, stdout: "pipe", stderr: "pipe" },
		);
		const stdout = new Response(child.stdout).text(),
			stderr = new Response(child.stderr).text();
		expect(await child.exited, `${await stdout} ${await stderr}`).toBe(86);
		Date.now = () => now() + BOARD_LOCK_MS.lease;
		const blocked = readArchitectureModel(vault);
		expect(blocked).toMatchObject({ success: false, code: "RECOVERY_REQUIRED" });
		if (blocked.success || blocked.recovery === undefined) throw new Error(JSON.stringify(blocked));
		const retained = await readArchitectureCheckpoint(
			vault,
			blocked.recovery.checkpoint,
			undefined,
			undefined,
			{ compare: false },
		);
		expect(retained).toMatchObject({
			success: true,
			selectedState: {
				id: created.target.state,
				lifecycle: type === "adopt" ? "historical" : "shelved",
			},
		});
		if (!retained.success) throw new Error(JSON.stringify(retained));
		expect(retained.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
			"Queues work.",
		);
		const recovered = await recoverArchitectureModel(vault);
		expect(recovered).toMatchObject({
			success: true,
			operation: { checkpoint: { id: blocked.recovery.checkpoint }, cleanup: "complete" },
		});
		if (!recovered.success || recovered.operation === undefined)
			throw new Error(JSON.stringify(recovered));
		expect(await editArchitectureModule(vault, input)).toEqual(recovered.operation);
		const current = readArchitectureModel(vault);
		expect(current).toMatchObject({
			success: true,
			manifest: { current: { id: type === "adopt" ? created.target.state : "Current" } },
			proposals: [],
		});
		const history = await listArchitectureCheckpoints(vault);
		if (!history.success) throw new Error(JSON.stringify(history));
		expect(
			history.checkpoints.filter((checkpoint) => checkpoint.lifecycle?.type === type),
		).toHaveLength(1);
	},
	15_000,
);
