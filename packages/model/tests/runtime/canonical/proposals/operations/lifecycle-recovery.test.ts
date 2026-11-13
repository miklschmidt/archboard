import { afterEach, expect, test } from "bun:test";
import { MODEL_LOCK_MS } from "#runtime/lock/constants/durations.ts";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/model/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/model/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/canonical/edit/operations/fixture.ts";
import {
	request,
	proposal,
	writeInProcess,
} from "#tests/runtime/canonical/proposals/operations/fixture.ts";

const now = Date.now;
afterEach(() => {
	Date.now = now;
	disposeFixtures();
});

test.each([
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
		const { exitCode, output } = await writeInProcess(root, vault, input, point);
		expect(exitCode, output).toBe(86);
		Date.now = () => now() + MODEL_LOCK_MS.lease;
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
