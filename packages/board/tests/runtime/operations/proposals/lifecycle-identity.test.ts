import { afterEach, expect, test } from "bun:test";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

const random = Math.random;
afterEach(() => {
	Math.random = random;
	disposeFixtures();
});

function repeatingIdentity() {
	let count = 0;
	Math.random = () => (count++ < 100 ? 0 : 1 / 62);
}

test("completed state and subject identities remain reserved after active proposal removal", async () => {
	const { vault } = fixture();
	Math.random = () => 0;
	const created = await proposal(vault, "Original", "Current", [
		{ type: "add-module", module: { name: "Abandoned cache", kind: "service", order: 40 } },
	]);
	Math.random = random;
	const draft = await selected(vault, created.target.state!);
	const original = draft.modules.find((module) => module.name === "Abandoned cache")!.id;
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, created.target.state!)),
		proposal: { type: "shelve", reason: "Keep the first identity in history." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const input = await request(vault);
	repeatingIdentity();
	const added = await editArchitectureModule(vault, {
		...input,
		changes: [
			{ type: "add-module", module: { name: "Different cache", kind: "service", order: 40 } },
		],
	});
	Math.random = random;
	if (!added.success) throw new Error(JSON.stringify(added));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.modules.find((module) => module.name === "Different cache")!.id).not.toBe(
		original,
	);
	const next = await request(vault);
	repeatingIdentity();
	const continuing = await editArchitectureModule(vault, {
		...next,
		proposal: { type: "create", name: "Another proposal" },
		changes: [],
	});
	Math.random = random;
	if (!continuing.success) throw new Error(JSON.stringify(continuing));
	expect(continuing.target.state).not.toBe(created.target.state);
	expect(
		(await selected(vault, created.target.state!)).modules.find((module) => module.id === original)
			?.name,
	).toBe("Abandoned cache");
}, 15_000);
