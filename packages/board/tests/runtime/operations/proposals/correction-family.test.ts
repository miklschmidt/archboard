import { afterEach, expect, test } from "bun:test";
import { readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("repeated corrections retain their audit chain and the exact evidence behind new draft baselines", async () => {
	const { root, vault } = fixture();
	const parent = await proposal(vault, "Recorded alternative");
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Keep the recorded alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const correction = {
		reason: "The recorded source already uses this gateway name.",
		revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
		previous: shelved.checkpoint.id,
	};
	const first = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		correction,
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "First factual correction." },
			},
		],
	});
	if (!first.success) throw new Error(JSON.stringify(first));
	const following = await proposal(vault, "Following plan", parent.target.state!, [
		{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Proposed name" } },
	]);
	const before = await selected(vault, following.target.state!);
	expect(
		git(root, "merge-base", "--is-ancestor", first.checkpoint.id, before.selectedState!.baseline!),
	).toBe("");
	const second = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		correction: { ...correction, previous: first.checkpoint.id },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Second factual correction." },
			},
		],
	});
	expect(second).toMatchObject({ success: true, reconciliation: false });
	if (!second.success) throw new Error(JSON.stringify(second));
	const corrected = await selected(vault, parent.target.state!);
	expect(corrected.selectedState?.corrections?.map((entry) => entry.checkpoint)).toEqual([
		first.checkpoint.id,
		second.checkpoint.id,
	]);
	const firstExact = await readArchitectureCheckpoint(
		vault,
		first.checkpoint.id,
		undefined,
		undefined,
		{ compare: false },
	);
	if (!firstExact.success) throw new Error(JSON.stringify(firstExact));
	expect(firstExact.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"First factual correction.",
	);
}, 30_000);

test("a correction preserves conflicting draft content and blocks following descendants", async () => {
	const { root, vault } = fixture();
	const parent = await proposal(vault, "Recorded alternative");
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Keep the recorded alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const following = await proposal(vault, "Following plan", parent.target.state!, [
		{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Proposed name" } },
	]);
	const child = await proposal(vault, "Dependent plan", following.target.state!);
	const before = await selected(vault, following.target.state!);
	const result = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		correction: {
			previous: shelved.checkpoint.id,
			reason: "The source uses this historical name.",
			revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
		},
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Historical name" } }],
	});
	expect(result).toMatchObject({ success: true, reconciliation: true });
	const conflicted = await selected(vault, following.target.state!);
	expect(conflicted.selectedState).toMatchObject({
		baseline: before.selectedState!.baseline,
		standing: {
			issues: expect.arrayContaining([
				expect.objectContaining({
					subject: "Shop#Gateway",
					field: "name",
					kind: "competing-field",
				}),
			]),
		},
	});
	expect(conflicted.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe(
		"Proposed name",
	);
	expect((await selected(vault, child.target.state!)).selectedState?.standing?.blockedBy).toBe(
		following.target.state!,
	);
}, 25_000);
