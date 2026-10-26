import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { declareDirectory } from "@archboard/workspace/checkouts";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule, releaseArchitectureClaim } from "@archboard/board/store-write";
import {
	publicationFixture,
	cleanPublicationFixtures,
	git,
	retain,
} from "#tests/runtime/support/publication-fixture.ts";
import { structureIntent } from "#tests/runtime/operations/model-edit/fixture.ts";

const originalState = process.env["XDG_STATE_HOME"];
const originalRegistry = process.env["ARCHBOARD_REPOS"];
afterEach(() => {
	if (originalState === undefined) delete process.env["XDG_STATE_HOME"];
	else process.env["XDG_STATE_HOME"] = originalState;
	if (originalRegistry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = originalRegistry;
	cleanPublicationFixtures();
});

function isolatedFixture() {
	const fixture = publicationFixture();
	process.env["XDG_STATE_HOME"] = join(fixture.home, "state");
	process.env["ARCHBOARD_REPOS"] = join(fixture.home, "state", "repos.json");
	return fixture;
}

async function referencedFixture() {
	const local = isolatedFixture();
	const foreign = publicationFixture();
	git(foreign.root, "remote", "set-url", "origin", "https://github.com/acme/ledger.git");
	const model = readArchitectureModel(foreign.vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	for (const file of ["model.json", ...model.modules.map((module) => module.file)]) {
		const path = join(foreign.vault, file);
		writeFileSync(path, readFileSync(path, "utf8").replaceAll("Shop", "Ledger"));
	}
	await declareDirectory(foreign.root, { choose: true });
	const checkpoint = await retain(foreign.vault);
	const reference = {
		repo: "github.com/acme/ledger",
		model: "Ledger",
		subject: "Ledger#Gateway",
		state: "current",
	};
	const request = await structureIntent(local.vault, ["Shop#Gateway"]);
	const edited = await editArchitectureModule(local.vault, {
		...request,
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { references: [reference] } }],
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	await releaseArchitectureClaim(local.vault, { claim: request.claim, writer: request.writer });
	return { local, foreign, reference, checkpoint, edited };
}

test("draft navigation composes state selection with code, comparisons, and exact foreign pins", async () => {
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
	const current = readArchitectureModel(local.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.modules.find((module) => module.id === "Shop#Gateway")?.name).toBe("Gateway");
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
