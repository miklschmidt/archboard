import { afterEach, expect, test } from "bun:test";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("dependent drafts keep their lineage and exact retained baseline after their parent is adopted", async () => {
	const { root, vault } = fixture();
	const parent = await proposal(vault, "Queued API", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queue API" } },
	]);
	const child = await proposal(vault, "Batched API", parent.target.state!, [
		{
			type: "edit-module",
			subject: "Shop#Gateway",
			set: { description: "Batches accepted work." },
		},
	]);
	const adopted = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "adopt", reason: "The queued API is implemented." },
		changes: [],
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
	const following = await selected(vault, child.target.state!);
	expect(following.selectedState).toMatchObject({
		id: child.target.state,
		predecessor: parent.target.state,
		lifecycle: "draft",
	});
	expect(following.selectedState?.standing).toBeUndefined();
	expect(following.modules.find((module) => module.id === "Shop#Gateway")).toMatchObject({
		name: "Queue API",
		description: "Batches accepted work.",
	});
	const completed = await editArchitectureModule(vault, {
		...(await request(vault, child.target.state!)),
		proposal: { type: "adopt", reason: "Batching is implemented." },
		changes: [],
	});
	expect(completed).toMatchObject({
		success: true,
		selectedState: {
			id: child.target.state,
			predecessor: parent.target.state,
			previousCurrent: parent.target.state,
		},
	});
	if (!completed.success) throw new Error(JSON.stringify(completed));
	expect(
		git(root, "merge-base", "--is-ancestor", adopted.checkpoint.id, completed.checkpoint.id),
	).toBe("");
	expect((await selected(vault, parent.target.state!)).selectedState?.lifecycle).toBe("historical");
}, 20_000);

test("unsettled proposals refuse adoption but shelving preserves their final side and releases dependent standing", async () => {
	const { vault } = fixture();
	const parent = await proposal(vault, "Alternative", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Draft API" } },
	]);
	const child = await proposal(vault, "Following", parent.target.state!);
	const changed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Current API" } }],
	});
	if (!changed.success) throw new Error(JSON.stringify(changed));
	for (const state of [parent.target.state!, child.target.state!]) {
		expect(
			await editArchitectureModule(vault, {
				...(await request(vault, state)),
				proposal: { type: "adopt", reason: "Try unfinished architecture." },
				changes: [],
			}),
		).toMatchObject({ success: false, code: "PROPOSAL_BLOCKED", applied: false });
	}
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Keep the unresolved alternative as history." },
		changes: [],
	});
	expect(shelved).toMatchObject({ success: true, selectedState: { lifecycle: "shelved" } });
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	expect(shelved.checkpoint.lifecycle?.proposal.standing?.issues.length).toBeGreaterThan(0);
	const archived = await selected(vault, parent.target.state!);
	expect(archived.selectedState?.standing).toBeUndefined();
	expect(archived.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe("Draft API");
	const following = await selected(vault, child.target.state!);
	expect(following.selectedState?.standing).toBeUndefined();
	expect(following.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe("Draft API");
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		manifest: { current: { id: "Current" } },
	});
}, 20_000);
