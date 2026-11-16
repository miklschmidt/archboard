import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/model/store-read";
import { editArchitectureModule } from "@archboard/model/store-write";
import { fixture, git, disposeFixtures } from "#tests/runtime/canonical/edit/operations/fixture.ts";
import { proposal, request } from "#tests/runtime/canonical/proposals/operations/fixture.ts";

afterEach(disposeFixtures);

/** A repository whose `plan` branch, which is not checked out, holds a proposal that `main` lacks. */
async function branchFixture() {
	const { root, vault } = fixture();
	git(root, "checkout", "--quiet", "-b", "plan");
	const draft = await proposal(vault, "Branch plan", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Planned on a branch." } },
	]);
	git(root, "add", ".archboard/vault");
	git(root, "commit", "--quiet", "-m", "test: plan on a branch");
	git(root, "checkout", "--quiet", "main");
	return { root, vault, state: draft.target.state! };
}

test("a branch reading holds the model and proposal of a branch that is not checked out", async () => {
	const { root, vault, state } = await branchFixture();
	const before = {
		head: git(root, "rev-parse", "HEAD"),
		index: readFileSync(join(root, ".git/index")),
		status: git(root, "status", "--porcelain=v1", "--untracked-files=all"),
	};
	const commit = git(root, "rev-parse", "plan");

	const checkedOut = await readArchitectureModel(vault, undefined, undefined, {});
	if (!checkedOut.success) throw new Error(JSON.stringify(checkedOut));
	expect(checkedOut.proposals).toHaveLength(0);
	expect(await readArchitectureModel(vault, undefined, undefined, { state })).toMatchObject({
		success: false,
		code: "STATE_NOT_FOUND",
	});

	const branch = await readArchitectureModel(vault, undefined, undefined, { ref: "plan" });
	if (!branch.success) throw new Error(JSON.stringify(branch));
	expect(branch.sourceRef).toEqual({ ref: "plan", commit });
	expect(branch.proposals.map((entry) => entry.id)).toEqual([state]);
	expect(branch.revision.digest).not.toBe(checkedOut.revision.digest);

	// `state` and the comparison base resolve inside the vault that was read.
	const planned = await readArchitectureModel(vault, "Shop#Gateway", undefined, {
		ref: "plan",
		state,
	});
	if (!planned.success) throw new Error(JSON.stringify(planned));
	expect(planned.sourceRef).toEqual({ ref: "plan", commit });
	expect(planned.selectedState).toMatchObject({ id: state, lifecycle: "draft" });
	expect(planned.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Planned on a branch.",
	);
	expect(planned.comparison).toMatchObject({ reason: "current" });
	expect(planned.comparison?.against).toMatchObject({ lifecycle: "current" });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			ref: commit,
			state,
			against: "Current",
		}),
	).toMatchObject({ success: true, sourceRef: { ref: commit, commit } });

	expect(git(root, "rev-parse", "HEAD")).toBe(before.head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(before.index);
	expect(git(root, "status", "--porcelain=v1", "--untracked-files=all")).toBe(before.status);
}, 30_000);

test("a ref that the repository cannot resolve, or one named with a checkpoint, is refused", async () => {
	const { root, vault } = fixture();
	const unknown = await readArchitectureModel(vault, undefined, undefined, {
		ref: "no-such-branch",
	});
	expect(unknown).toMatchObject({
		success: false,
		code: "SOURCE_REF_NOT_FOUND",
		diagnostics: [{ code: "SOURCE_REF_NOT_FOUND", subjects: ["no-such-branch"] }],
	});
	expect(await readArchitectureModel(vault, undefined, undefined, { ref: "--all" })).toMatchObject({
		success: false,
		code: "SOURCE_REF_NOT_FOUND",
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			ref: "main",
			checkpoint: git(root, "rev-parse", "HEAD"),
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID" });
}, 15_000);

test("a branch reading refuses a state that the branch does not hold, though the archive retains it", async () => {
	const { vault } = await branchFixture();
	const shipped = await proposal(vault, "Shipped on main", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Shipped on main." } },
	]);
	const adopted = await editArchitectureModule(vault, {
		...(await request(vault, shipped.target.state!)),
		proposal: { type: "adopt", reason: "It shipped on main." },
		changes: [],
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
	for (const selection of [{ state: shipped.target.state! }, { against: shipped.target.state! }])
		expect(
			await readArchitectureModel(vault, undefined, undefined, { ref: "plan", ...selection }),
		).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });
}, 30_000);
