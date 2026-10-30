import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listArchitectureCheckpoints, readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("the same later draft edit changes the same bytes and lines after zero or several completed proposals", async () => {
	const measurements = [];
	for (const completed of [0, 2]) {
		const { root, vault } = fixture();
		const completedCheckpoints = [];
		let current = "Current";
		for (let index = 0; index < completed; index++) {
			const draft = await proposal(vault, `Completed ${index}`, current);
			const type = index === 0 ? "shelve" : "adopt";
			const result = await editArchitectureModule(vault, {
				...(await request(vault, draft.target.state!)),
				proposal: { type, reason: "Complete this proposal." },
				changes: [],
			});
			if (!result.success) throw new Error(JSON.stringify(result));
			completedCheckpoints.push(result.checkpoint.id);
			if (type === "adopt") current = draft.target.state!;
		}
		const active = await proposal(vault, "Active", current);
		const draft = await selected(vault, active.target.state!);
		const proposalFile = draft.proposals[0]!.file;
		const manifest = readFileSync(join(vault, "model.json"));
		const bytes = readFileSync(join(vault, proposalFile));
		git(root, "add", ".archboard/vault");
		git(root, "commit", "--quiet", "-m", "test: record current authored inputs");
		expect(readArchitectureModel(vault)).toMatchObject({
			success: true,
			manifest: { current: { id: current } },
		});
		const result = await editArchitectureModule(vault, {
			...(await request(vault, active.target.state!)),
			proposal: { type: "edit" },
			changes: [
				{ type: "edit-module", subject: "Shop#Gateway", set: { description: "One later field." } },
			],
		});
		if (!result.success) throw new Error(JSON.stringify(result));
		expect(readFileSync(join(vault, "model.json"))).toEqual(manifest);
		const diff = git(root, "diff", "--numstat", "--", ".archboard/vault")
			.split("\n")
			.map((line) => line.split("\t"));
		expect(diff).toHaveLength(1);
		expect(diff[0]![2]).toBe(`.archboard/vault/${proposalFile}`);
		const history = await listArchitectureCheckpoints(vault);
		if (!history.success) throw new Error(JSON.stringify(history));
		expect(
			history.checkpoints
				.filter((checkpoint) => checkpoint.lifecycle !== undefined)
				.map((checkpoint) => checkpoint.id)
				.toSorted(),
		).toEqual(completedCheckpoints.toSorted());
		measurements.push({
			lines: diff[0]!.slice(0, 2),
			bytes: readFileSync(join(vault, proposalFile)).length - bytes.length,
		});
	}
	expect(measurements[1]!.lines).toEqual(measurements[0]!.lines);
	expect(measurements[1]!.bytes).toBe(measurements[0]!.bytes);
}, 30_000);
