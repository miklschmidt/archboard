import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { git, retain } from "#tests/runtime/support/publication-fixture.ts";
import {
	isolatedFixture,
	referencedFixture,
	disposeReferences,
} from "#tests/runtime/operations/model-edit/reference-fixture.ts";
import { structureIntent } from "#tests/runtime/operations/model-edit/fixture.ts";
import {
	request as familyRequest,
	proposal as createProposal,
} from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeReferences);

test("draft navigation and adoption preserve code, comparisons, and exact foreign pins", async () => {
	const { local, foreign, checkpoint, reference } = await referencedFixture();
	const created = await editArchitectureModule(local.vault, {
		...(await structureIntent(local.vault, ["Shop", "Shop#Gateway"])),
		proposal: { type: "create", name: "Linked proposal" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { name: "Draft gateway", binding: { repo: "github.com/acme/shop", path: "code.ts" } },
			},
		],
	});
	expect(created.success).toBe(true);
	if (!created.success || created.target.state === null) throw new Error(JSON.stringify(created));
	expect(created.checkpoint.references).toEqual([
		{ module: "Shop#Gateway", index: 0, reference, checkpoint: checkpoint.id },
	]);
	const selected = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		state: created.target.state,
		references: true,
		code: true,
	});
	expect(selected).toMatchObject({
		success: true,
		selectedState: { id: created.target.state, lifecycle: "draft" },
		comparison: { against: { id: "Current" } },
		codeTarget: { ok: true, target: join(local.root, "code.ts") },
		resolvedReferences: [{ status: "available" }],
	});
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			state: created.target.state,
			reference: 0,
		}),
	).toMatchObject({ success: true, manifest: { id: "Ledger" }, selectedModule: "Ledger#Gateway" });
	const before = readArchitectureModel(local.vault);
	if (!before.success) throw new Error(JSON.stringify(before));
	expect(before.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe("Gateway");
	const adopted = await editArchitectureModule(local.vault, {
		...(await familyRequest(local.vault, created.target.state)),
		proposal: { type: "adopt", reason: "The linked gateway is implemented." },
		changes: [],
	});
	expect(adopted).toMatchObject({
		success: true,
		checkpoint: { references: created.checkpoint.references },
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
	writeFileSync(join(foreign.vault, "gateway.module.json"), "{");
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			checkpoint: created.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({
		success: true,
		checkpoint: { id: checkpoint.id },
		selectedModule: "Ledger#Gateway",
	});
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			checkpoint: adopted.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({
		success: true,
		checkpoint: { id: checkpoint.id },
		selectedModule: "Ledger#Gateway",
	});
	const current = readArchitectureModel(local.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe(
		"Draft gateway",
	);
}, 20_000);

test("a foreign draft reference follows its explicit state and retains that draft for history", async () => {
	const { local, foreign, reference } = await referencedFixture();
	const foreignDraft = await editArchitectureModule(foreign.vault, {
		...(await structureIntent(foreign.vault, ["Ledger", "Ledger#Gateway"])),
		proposal: { type: "create", name: "Foreign plan" },
		changes: [{ type: "edit-module", subject: "Ledger#Gateway", set: { name: "Planned ledger" } }],
	});
	if (!foreignDraft.success || foreignDraft.target.state === null)
		throw new Error(JSON.stringify(foreignDraft));
	await retain(foreign.vault, "retain-current-with-draft");
	const authored = { ...reference, state: foreignDraft.target.state };
	const localDraft = await editArchitectureModule(local.vault, {
		...(await structureIntent(local.vault, ["Shop", "Shop#Gateway"])),
		proposal: { type: "create", name: "Linked foreign plan" },
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { references: [authored] } }],
	});
	expect(localDraft).toMatchObject({ success: true });
	if (!localDraft.success || localDraft.target.state === null)
		throw new Error(JSON.stringify(localDraft));
	expect(localDraft.checkpoint.references).toEqual([
		{
			module: "Shop#Gateway",
			index: 0,
			reference: authored,
			checkpoint: foreignDraft.checkpoint.id,
		},
	]);
	const selected = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		state: localDraft.target.state,
		references: true,
	});
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.resolvedReferences?.[0]).toMatchObject({
		name: "Planned ledger",
		modelName: "Ledger architecture",
		stateName: "Foreign plan",
		lifecycle: "draft",
	});
	expect(
		selected.comparison?.subjects.find((subject) => subject.id === "Shop#Gateway"),
	).toMatchObject({
		kind: "changed",
		fields: expect.arrayContaining([
			{ field: "references", before: [reference], after: [authored] },
		]),
	});
	const followed = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		state: localDraft.target.state,
		reference: 0,
	});
	expect(followed).toMatchObject({
		success: true,
		selectedState: { id: foreignDraft.target.state, lifecycle: "draft" },
		location: { state: foreignDraft.target.state },
	});
	if (!followed.success) throw new Error(JSON.stringify(followed));
	expect(followed.modules.find((module) => module.id === "Ledger#Gateway")?.name).toBe(
		"Planned ledger",
	);
	writeFileSync(join(foreign.vault, "gateway.module.json"), "{");
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			state: localDraft.target.state,
			reference: 0,
		}),
	).toMatchObject({ success: false, code: "REFERENCE_UNAVAILABLE" });
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			checkpoint: localDraft.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({
		success: true,
		selectedState: { id: foreignDraft.target.state, lifecycle: "draft" },
		checkpoint: { id: foreignDraft.checkpoint.id },
	});
}, 20_000);

test("reference conflicts retain the selected foreign pin through external reconciliation and settlement", async () => {
	const { local, foreign, reference, checkpoint } = await referencedFixture();
	const authored = { ...reference, subject: "Ledger#Worker" };
	const proposal = await createProposal(local.vault, "Worker reference", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { references: [authored] } },
	]);
	const path = join(local.vault, "gateway.module.json");
	const current = JSON.parse(readFileSync(path, "utf8"));
	current.references = [{ ...reference, state: "Current" }];
	writeFileSync(path, JSON.stringify(current));
	const reconciled = await editArchitectureModule(local.vault, {
		...(await familyRequest(local.vault)),
		proposal: { type: "reconcile" },
		changes: [],
	});
	expect(reconciled).toMatchObject({ success: true, reconciliation: true });
	if (!reconciled.success) throw new Error(JSON.stringify(reconciled));
	const settled = await editArchitectureModule(local.vault, {
		...(await familyRequest(local.vault, proposal.target.state!)),
		proposal: {
			type: "settle",
			resolutions: [{ subject: "Shop#Gateway", field: "references", take: "mine" }],
		},
		changes: [],
	});
	expect(settled).toMatchObject({
		success: true,
		reconciliation: false,
		checkpoint: {
			references: [{ reference: authored, checkpoint: checkpoint.id }],
		},
	});
	if (!settled.success) throw new Error(JSON.stringify(settled));
	writeFileSync(join(foreign.vault, "model.json"), "{");
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			checkpoint: settled.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({
		success: true,
		selectedModule: "Ledger#Worker",
		checkpoint: { id: checkpoint.id },
	});
}, 20_000);

test("a bound module resolves code in its own checkout without changing architecture ownership", async () => {
	const { root, vault } = isolatedFixture();
	const edited = await editArchitectureModule(vault, {
		...(await structureIntent(vault, ["Shop#Gateway"])),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: {
					binding: { repo: "github.com/acme/shop", path: "code.ts" },
				},
			},
		],
	});
	expect(edited.success).toBe(true);
	const before = readArchitectureModel(vault);
	const reading = await readArchitectureModel(vault, "Shop#Gateway", undefined, { code: true });
	expect(reading).toMatchObject({
		success: true,
		selectedModule: "Shop#Gateway",
		codeTarget: {
			ok: true,
			root,
			target: join(root, "code.ts"),
			repository: "github.com/acme/shop",
		},
	});
	expect(readArchitectureModel(vault)).toEqual(before);
});

test("explicit references follow the chosen foreign model and never change either model's ownership", async () => {
	const { local, foreign, reference } = await referencedFixture();
	const beforeLocal = readArchitectureModel(local.vault);
	const beforeForeign = readArchitectureModel(foreign.vault);
	const reading = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		references: true,
	});
	expect(reading).toMatchObject({
		success: true,
		resolvedReferences: [
			{
				module: "Shop#Gateway",
				index: 0,
				reference,
				status: "available",
				address: {
					vault: foreign.vault,
					model: "Ledger",
					subject: "Ledger#Gateway",
					state: "Current",
				},
			},
		],
	});
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, { reference: 0 }),
	).toMatchObject({
		success: true,
		manifest: { id: "Ledger" },
		selectedModule: "Ledger#Gateway",
		location: {
			vault: foreign.vault,
			model: "Ledger",
			subject: "Ledger#Gateway",
			state: "Current",
		},
	});
	expect(readArchitectureModel(local.vault)).toEqual(beforeLocal);
	expect(readArchitectureModel(foreign.vault)).toEqual(beforeForeign);
	const changed = JSON.parse(readFileSync(join(foreign.vault, "model.json"), "utf8"));
	writeFileSync(join(foreign.vault, "model.json"), JSON.stringify({ ...changed, id: "Other" }));
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, { reference: 0 }),
	).toMatchObject({ success: false, code: "REFERENCE_UNAVAILABLE" });
});

test("retained references reopen pinned foreign architecture despite changed or missing current inputs", async () => {
	const { local, foreign, checkpoint, edited, reference } = await referencedFixture();
	expect(edited.checkpoint.references).toEqual([
		{ module: "Shop#Gateway", index: 0, reference, checkpoint: checkpoint.id },
	]);
	writeFileSync(join(foreign.vault, "gateway.module.json"), "{");
	const exact = await readArchitectureCheckpoint(local.vault, edited.checkpoint.id, "Shop#Gateway");
	expect(exact).toMatchObject({
		success: true,
		resolvedReferences: [{ status: "available", address: { checkpoint: checkpoint.id } }],
	});
	const followed = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		checkpoint: edited.checkpoint.id,
		reference: 0,
	});
	expect(followed).toMatchObject({
		success: true,
		manifest: { id: "Ledger" },
		selectedModule: "Ledger#Gateway",
		checkpoint: { id: checkpoint.id },
	});
	git(foreign.root, "update-ref", "-d", "refs/heads/archboard-history");
	git(foreign.root, "for-each-ref", "--format=%(refname)", "refs/archboard/retained")
		.split("\n")
		.filter(Boolean)
		.forEach((ref) => git(foreign.root, "update-ref", "-d", ref));
	git(foreign.root, "reflog", "expire", "--expire=now", "--all");
	git(foreign.root, "gc", "--prune=now");
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			checkpoint: edited.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({ success: false, code: "REFERENCE_UNAVAILABLE" });
	expect(await readArchitectureCheckpoint(local.vault, edited.checkpoint.id)).toMatchObject({
		success: true,
		resolvedReferences: [{ status: "unavailable" }],
	});
});

test("historical code resolution refuses changed or unavailable source while preserving architecture", async () => {
	const { root, vault } = isolatedFixture();
	symlinkSync("code.ts", join(root, "entry.ts"));
	git(root, "add", "entry.ts");
	git(root, "commit", "--quiet", "-m", "test: bind source through a link");
	const edited = await editArchitectureModule(vault, {
		...(await structureIntent(vault, ["Shop#Gateway"])),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { binding: { repo: "github.com/acme/shop", path: "entry.ts" } },
			},
		],
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	const options = { code: true, checkpoint: edited.checkpoint.id };
	expect(await readArchitectureModel(vault, "Shop#Gateway", undefined, options)).toMatchObject({
		success: true,
		codeTarget: { ok: true },
	});
	writeFileSync(join(root, "code.ts"), "export const version = 2;\n");
	expect(await readArchitectureModel(vault, "Shop#Gateway", undefined, options)).toMatchObject({
		success: true,
		codeTarget: { ok: false, code: "SOURCE_UNAVAILABLE" },
	});
	git(root, "add", "code.ts");
	git(root, "commit", "--quiet", "-m", "test: change source");
	expect(await readArchitectureModel(vault, "Shop#Gateway", undefined, options)).toMatchObject({
		success: true,
		codeTarget: { ok: false, code: "CHECKOUT_ON_OTHER_REF" },
	});
});

test("bindings into another repository retain its source association through existing checkout selection", async () => {
	const { local, foreign } = await referencedFixture();
	const edited = await editArchitectureModule(local.vault, {
		...(await structureIntent(local.vault, ["Shop#Gateway"])),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { binding: { repo: "github.com/acme/ledger", path: "code.ts" } },
			},
		],
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	const reading = await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
		code: true,
		checkpoint: edited.checkpoint.id,
	});
	expect(reading).toMatchObject({
		success: true,
		codeTarget: { ok: true, root: foreign.root },
		sourceEvidence: expect.arrayContaining([
			{
				repo: "github.com/acme/ledger",
				commit: git(foreign.root, "rev-parse", "HEAD"),
				uncommitted: false,
				status: "available",
			},
		]),
	});
});

test("historical directory bindings ignore architecture-only changes in the same checkout", async () => {
	const { vault } = isolatedFixture();
	const edited = await editArchitectureModule(vault, {
		...(await structureIntent(vault, ["Shop#Gateway"])),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { binding: { repo: "github.com/acme/shop", path: "" } },
			},
		],
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	expect(
		await readArchitectureModel(vault, "Shop#Gateway", undefined, {
			code: true,
			checkpoint: edited.checkpoint.id,
		}),
	).toMatchObject({ success: true, codeTarget: { ok: true, kind: "directory" } });
});

test("foreign relationship references keep the exact subject without turning it into a module", async () => {
	const { local } = await referencedFixture();
	const edited = await editArchitectureModule(local.vault, {
		...(await structureIntent(local.vault, ["Shop#Gateway"])),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: {
					references: [
						{
							repo: "github.com/acme/ledger",
							model: "Ledger",
							subject: "Ledger#Dispatch",
							state: "current",
						},
					],
				},
			},
		],
	});
	expect(edited.success).toBe(true);
	if (!edited.success) throw new Error(JSON.stringify(edited));
	expect(
		await readArchitectureModel(local.vault, "Shop#Gateway", undefined, {
			checkpoint: edited.checkpoint.id,
			reference: 0,
		}),
	).toMatchObject({
		success: true,
		manifest: { id: "Ledger" },
		selectedSubject: "Ledger#Dispatch",
		location: { subject: "Ledger#Dispatch" },
	});
});
