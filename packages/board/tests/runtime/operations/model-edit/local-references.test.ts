import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule, retainArchitectureCheckpoint } from "@archboard/board/store-write";
import {
	isolatedFixture,
	referencedFixture,
	disposeReferences,
} from "#tests/runtime/operations/model-edit/reference-fixture.ts";
import { structureIntent } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request } from "#tests/runtime/operations/proposals/fixture.ts";

import { git, changeResponsibility } from "#tests/runtime/support/publication-fixture.ts";

afterEach(disposeReferences);

test.each([
	["Shop#Gateway", "Gateway"],
	["Shop#Worker", "Worker"],
])(
	"same-model current references preserve exact local subject %s across edits",
	async (subject, name) => {
		const { vault } = isolatedFixture();
		const reference = { repo: "github.com/acme/shop", model: "Shop", subject, state: "current" };
		const created = await editArchitectureModule(vault, {
			...(await structureIntent(vault, ["Shop#Gateway"])),
			changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { references: [reference] } }],
		});
		expect(created).toMatchObject({ success: true });
		if (!created.success) throw new Error(JSON.stringify(created));
		const edited = await editArchitectureModule(vault, {
			...(await structureIntent(vault, [subject])),
			changes: [{ type: "edit-module", subject, set: { name: "Later target" } }],
		});
		expect(edited).toMatchObject({ success: true });
		expect(
			await readArchitectureModel(vault, "Shop#Gateway", undefined, { reference: 0 }),
		).toMatchObject({
			success: true,
			selectedModule: subject,
			modules: expect.arrayContaining([
				expect.objectContaining({ id: subject, name: "Later target" }),
			]),
		});
		const exact = await readArchitectureModel(vault, "Shop#Gateway", undefined, {
			checkpoint: created.checkpoint.id,
			reference: 0,
		});
		expect(exact).toMatchObject({
			success: true,
			selectedModule: subject,
			checkpoint: { id: created.checkpoint.id },
			modules: expect.arrayContaining([expect.objectContaining({ id: subject, name })]),
		});
	},
	30_000,
);

test("a proposal pins local current separately from its own draft and preserves foreign targets", async () => {
	const {
		local,
		foreign: foreignFixture,
		reference: foreign,
		checkpoint,
	} = await referencedFixture();
	changeResponsibility(local.vault, "Current snapshot before the proposal");
	const observed = readArchitectureModel(local.vault);
	if (!observed.success) throw new Error(JSON.stringify(observed));
	const foreignBefore = readArchitectureModel(foreignFixture.vault);
	const reference = {
		repo: "github.com/acme/shop",
		model: "Shop",
		subject: "Shop#Worker",
		state: "current",
	};
	const created = await editArchitectureModule(local.vault, {
		...(await request(local.vault)),
		proposal: { type: "create", name: "Local link" },
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { references: [reference, foreign] } },
			{ type: "edit-module", subject: "Shop#Worker", set: { name: "Planned worker" } },
		],
	});
	expect(created).toMatchObject({ success: true });
	if (!created.success) throw new Error(JSON.stringify(created));
	expect(created.checkpoint.references).toEqual([
		{ module: "Shop#Gateway", index: 0, reference, checkpoint: expect.any(String) },
		{ module: "Shop#Gateway", index: 1, reference: foreign, checkpoint: checkpoint.id },
	]);
	const pin = created.checkpoint.references![0]!.checkpoint;
	git(local.root, "merge-base", "--is-ancestor", pin, created.checkpoint.id);
	git(local.root, "verify-commit", pin);
	expect(readArchitectureModel(foreignFixture.vault)).toEqual(foreignBefore);
	const workerPath = join(local.vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerPath, "utf8"));
	writeFileSync(workerPath, JSON.stringify({ ...worker, name: "Later worker" }));
	const exact = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		checkpoint: created.checkpoint.id,
		reference: 0,
	});
	expect(exact).toMatchObject({
		success: true,
		selectedModule: "Shop#Worker",
		checkpoint: { id: pin },
		revision: observed.revision,
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Worker", name: "Worker" }),
		]),
	});
}, 30_000);

test("explicit local checkpoint pins survive retention retries and unavailable current targets", async () => {
	const { home, root, vault } = isolatedFixture();
	const first = readArchitectureModel(vault);
	if (!first.success) throw new Error(JSON.stringify(first));
	const original = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId: "original-local",
		writer: "agent",
		doing: "Retain the original worker",
		expectedRevision: first.revision.digest,
		dependencies: [],
	});
	if (!original.success) throw new Error(JSON.stringify(original));
	const reference = {
		repo: "github.com/acme/shop",
		model: "Shop",
		subject: "Shop#Worker",
		state: "Current",
		checkpoint: original.checkpoint.id,
	};
	const edited = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { references: [reference] } },
			{ type: "edit-module", subject: "Shop#Worker", set: { name: "Later worker" } },
		],
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const intent = {
		target: "current" as const,
		operationId: "retain-local-pin",
		writer: "agent",
		doing: "Retain the pinned worker",
		expectedRevision: current.revision.digest,
		dependencies: [],
	};
	const retained = await retainArchitectureCheckpoint(vault, intent);
	expect(retained).toMatchObject({ success: true });
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(await retainArchitectureCheckpoint(vault, intent)).toEqual(retained);
	git(root, "merge-base", "--is-ancestor", original.checkpoint.id, retained.checkpoint.id);
	const clone = join(home, "shallow");
	git(
		root,
		"clone",
		"--quiet",
		"--no-checkout",
		"--depth=1",
		"--single-branch",
		"--branch=archboard-history",
		`file://${root}`,
		clone,
	);
	const addressed = join(clone, ".archboard/vault");
	cpSync(vault, addressed, { recursive: true });
	expect(await readArchitectureCheckpoint(addressed, retained.checkpoint.id)).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
		diagnostics: [{ file: original.checkpoint.id }],
	});
	writeFileSync(join(vault, "model.json"), "{");
	expect(
		await readArchitectureModel(vault, "Shop#Gateway", undefined, {
			checkpoint: retained.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({
		success: true,
		selectedModule: "Shop#Worker",
		checkpoint: { id: original.checkpoint.id },
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Worker", name: "Worker" }),
		]),
	});
}, 30_000);
