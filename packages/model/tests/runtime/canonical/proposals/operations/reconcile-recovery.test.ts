import { afterEach, expect, test } from "bun:test";
import { MODEL_LOCK_MS } from "#runtime/lock/constants/durations.ts";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/model/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/model/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/canonical/edit/operations/fixture.ts";
import {
	request,
	selected,
	proposal,
	writeInProcess,
} from "#tests/runtime/canonical/proposals/operations/fixture.ts";
const now = Date.now;
afterEach(() => {
	Date.now = now;
	disposeFixtures();
});
test("a partial predecessor installation recovers the exact complete family standing and receipt", async () => {
	const { root, vault } = fixture();
	const draft = await proposal(vault, "Queued", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
	]);
	const intent = {
		...(await request(vault)),
		changes: [
			{
				type: "edit-module" as const,
				subject: "Shop#Gateway",
				set: { description: "Dispatches work." },
			},
		],
	};
	const { exitCode, output } = await writeInProcess(root, vault, intent, "file");
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
		proposals: expect.arrayContaining([
			expect.objectContaining({
				id: draft.target.state,
				standing: expect.objectContaining({
					issues: expect.arrayContaining([expect.objectContaining({ kind: "competing-field" })]),
				}),
			}),
		]),
	});
	const recovered = await recoverArchitectureModel(vault);
	expect(recovered).toMatchObject({
		success: true,
		operation: {
			success: true,
			reconciliation: true,
			checkpoint: { id: blocked.recovery.checkpoint },
		},
	});
	if (!recovered.success || recovered.operation === undefined)
		throw new Error(JSON.stringify(recovered));
	expect(await editArchitectureModule(vault, intent)).toEqual(recovered.operation);
	expect(
		(await selected(vault, draft.target.state!)).modules.find((m) => m.id === "Shop#Gateway")
			?.description,
	).toBe("Queues work.");
});
