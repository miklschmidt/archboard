import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("adoption installs the settled complete draft and retains both lasting states with one lifecycle event", async () => {
	const { vault } = fixture();
	const created = await proposal(vault, "Queued routing", "Current", [
		{
			type: "edit-module",
			subject: "Shop#Gateway",
			set: { description: "Queues accepted requests." },
		},
	]);
	const draft = await selected(vault, created.target.state!);
	const file = draft.proposals.find((entry) => entry.id === created.target.state)!.file;
	const input = {
		...(await request(vault, created.target.state!)),
		proposal: { type: "adopt" as const, reason: "The queue is implemented." },
		changes: [],
	};
	const adopted = await editArchitectureModule(vault, input);
	expect(adopted).toMatchObject({
		success: true,
		selectedState: { id: created.target.state, lifecycle: "current", previousCurrent: "Current" },
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
	expect(existsSync(join(vault, file))).toBe(false);
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.manifest.current?.id).toBe(created.target.state!);
	expect(current.proposals).toEqual([]);
	expect(current.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Queues accepted requests.",
	);
	const previous = await selected(vault, "Current");
	expect(previous.selectedState).toMatchObject({ id: "Current", lifecycle: "historical" });
	expect(previous.modules.find((module) => module.id === "Shop#Gateway")?.description).not.toBe(
		"Queues accepted requests.",
	);
	const exact = await readArchitectureCheckpoint(vault, adopted.checkpoint.id);
	expect(exact).toMatchObject({
		success: true,
		selectedState: { id: created.target.state, lifecycle: "historical" },
	});
	const original = await readArchitectureCheckpoint(vault, created.checkpoint.id);
	expect(original).toMatchObject({
		success: true,
		selectedState: { id: created.target.state, lifecycle: "draft" },
	});
	const bytes = readFileSync(join(vault, "model.json"));
	expect(await editArchitectureModule(vault, input)).toEqual(adopted);
	expect(readFileSync(join(vault, "model.json"))).toEqual(bytes);
	const history = await listArchitectureCheckpoints(vault);
	if (!history.success) throw new Error(JSON.stringify(history));
	expect(
		history.checkpoints.filter((checkpoint) => checkpoint.lifecycle?.type === "adopt"),
	).toHaveLength(1);
}, 15_000);

test("shelving retains the final compact patch and metadata without changing current inputs", async () => {
	const { vault } = fixture();
	const created = await proposal(vault, "Alternate routing", "Current", [
		{
			type: "edit-module",
			subject: "Shop#Gateway",
			set: { description: "Uses the alternate route." },
		},
	]);
	const renamed = await editArchitectureModule(vault, {
		...(await request(vault, created.target.state!)),
		proposal: {
			type: "edit",
			set: {
				name: "Parked routing",
				summary: "Keep this alternative.",
				documents: [{ repo: "github.com/acme/shop", path: "design.md" }],
			},
		},
		changes: [],
	});
	if (!renamed.success) throw new Error(JSON.stringify(renamed));
	const draft = await selected(vault, created.target.state!);
	const final = draft.proposals.find((entry) => entry.id === created.target.state)!;
	const manifest = readFileSync(join(vault, "model.json"));
	const gateway = readFileSync(join(vault, "gateway.module.json"));
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, created.target.state!)),
		proposal: { type: "shelve", reason: "The team chose another route." },
		changes: [],
	});
	expect(shelved).toMatchObject({
		success: true,
		selectedState: {
			lifecycle: "shelved",
			name: "Parked routing",
			formerNames: ["Alternate routing"],
			reason: "The team chose another route.",
		},
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	expect(readFileSync(join(vault, "model.json"))).toEqual(manifest);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(gateway);
	expect(existsSync(join(vault, final.file))).toBe(false);
	const reopened = await selected(vault, "Alternate routing");
	expect(reopened.selectedState).toMatchObject({
		id: created.target.state,
		lifecycle: "shelved",
		shelvedAt: shelved.checkpoint.lifecycle?.at,
	});
	expect(reopened.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Uses the alternate route.",
	);
	expect(shelved.checkpoint.lifecycle?.proposal).toMatchObject({
		changes: final.changes,
		baseline: final.baseline,
		documents: final.documents,
		predecessor: "Current",
	});
	const exact = await readArchitectureCheckpoint(vault, shelved.checkpoint.id);
	expect(exact).toMatchObject({ success: true, selectedState: { lifecycle: "shelved" } });
	if (!exact.success) throw new Error(JSON.stringify(exact));
	expect(exact.modules).toEqual(reopened.modules);
}, 15_000);
