import { afterEach, expect, test } from "bun:test";
import { MODEL_LOCK_MS } from "#runtime/lock/constants/durations.ts";
import { readArchitectureModel, listArchitectureCheckpoints } from "@archboard/model/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/model/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/canonical/edit/operations/fixture.ts";
import {
	request,
	proposal,
	selected,
	writeInProcess,
} from "#tests/runtime/canonical/proposals/operations/fixture.ts";

const now = Date.now;
afterEach(() => {
	Date.now = now;
	disposeFixtures();
});

test("an archive-only correction recovers after durable installation and retains one event", async () => {
	const { root, vault } = fixture();
	const parent = await proposal(vault, "Recorded alternative");
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Keep the alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const intent = {
		...(await request(vault, parent.target.state!)),
		correction: {
			previous: shelved.checkpoint.id,
			reason: "Correct its recorded routing.",
			revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
		},
		changes: [
			{
				type: "edit-module" as const,
				subject: "Shop#Gateway",
				set: { description: "Accurate routing." },
			},
		],
	};
	const { exitCode, output } = await writeInProcess(root, vault, intent, "installed");
	expect(exitCode, output).toBe(86);
	Date.now = () => now() + MODEL_LOCK_MS.lease;
	expect(readArchitectureModel(vault)).toMatchObject({
		success: false,
		code: "RECOVERY_REQUIRED",
	});
	const recovered = await recoverArchitectureModel(vault);
	expect(recovered).toMatchObject({
		success: true,
		operation: { success: true, cleanup: "complete" },
	});
	if (!recovered.success || recovered.operation === undefined)
		throw new Error(JSON.stringify(recovered));
	expect(await editArchitectureModule(vault, intent)).toEqual(recovered.operation);
	expect(
		(await selected(vault, parent.target.state!)).modules.find(
			(module) => module.id === "Shop#Gateway",
		)?.description,
	).toBe("Accurate routing.");
	const history = await listArchitectureCheckpoints(vault);
	if (!history.success) throw new Error(JSON.stringify(history));
	expect(
		history.checkpoints.filter((checkpoint) => checkpoint.correction !== undefined),
	).toHaveLength(1);
});
