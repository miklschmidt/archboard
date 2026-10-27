import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("superseded adoption requires a fresh explicit current comparison and installs the whole resolved proposal", async () => {
	const { vault } = fixture();
	const first = await proposal(vault, "Caching", "Current", [
		{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } },
		{ type: "edit-module", subject: "Shop#Worker", set: { description: "Uses the cache." } },
	]);
	const second = await proposal(vault, "Alternate", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Uses another route." } },
	]);
	const adopted = await editArchitectureModule(vault, {
		...(await request(vault, first.target.state!)),
		proposal: { type: "adopt", reason: "Caching is implemented." },
		changes: [],
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
	const input = await request(vault, second.target.state!);
	const manifest = readFileSync(join(vault, "model.json"));
	expect(
		await editArchitectureModule(vault, {
			...input,
			proposal: { type: "adopt", reason: "Choose the alternate design." },
			changes: [],
		}),
	).toMatchObject({ success: false, code: "PROPOSAL_SUPERSEDED", applied: false });
	expect(
		await editArchitectureModule(vault, {
			...input,
			proposal: { type: "adopt", reason: "Choose the alternate design.", force: true },
			changes: [],
		}),
	).toMatchObject({ success: false, code: "COMPARISON_REQUIRED", applied: false });
	const compared = await readArchitectureModel(vault, undefined, undefined, {
		state: second.target.state!,
		against: "current",
	});
	if (!compared.success || compared.comparison === undefined)
		throw new Error(JSON.stringify(compared));
	expect(
		await editArchitectureModule(vault, {
			...input,
			proposal: {
				type: "adopt",
				reason: "Choose the alternate design.",
				force: true,
				comparison: {
					...compared.comparison,
					revision: { ...compared.comparison.revision, digest: "0".repeat(64) },
				},
			},
			changes: [],
		}),
	).toMatchObject({ success: false, code: "COMPARISON_REQUIRED", applied: false });
	expect(readFileSync(join(vault, "model.json"))).toEqual(manifest);
	const forced = await editArchitectureModule(vault, {
		...input,
		proposal: {
			type: "adopt",
			reason: "Intentionally replace caching.",
			force: true,
			comparison: compared.comparison,
		},
		changes: [],
	});
	expect(forced).toMatchObject({
		success: true,
		selectedState: { id: second.target.state, lifecycle: "current" },
	});
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.modules.some((module) => module.name === "Cache")).toBe(false);
	expect(current.modules.find((module) => module.id === "Shop#Worker")?.description).not.toBe(
		"Uses the cache.",
	);
	expect(current.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Uses another route.",
	);
	expect((await selected(vault, first.target.state!)).selectedState?.lifecycle).toBe("historical");
}, 20_000);
