import { beforeAll, afterAll, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	retainArchitectureCheckpoint,
} from "@archboard/board/store-write";
import { fixture, git } from "../model-edit/fixture.ts";
import { destination, empty, cleanPortableFixtures } from "./portable-fixture.ts";
async function roundtripFixture() {
	const source = fixture();
	const current = readArchitectureModel(source.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(source.vault, {
		target: "current",
		expectedRevision: current.revision.digest,
		operationId: "portable-baseline",
		writer: "agent",
		doing: "retaining export evidence",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const request = {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "portable-install",
		writer: "agent",
		doing: "restoring portable architecture",
	};
	const installed = await importArchitectureModel(target.vault, request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	return { source, current, retained, target, request, installed };
}
let evidence: Awaited<ReturnType<typeof roundtripFixture>> | undefined;
beforeAll(async () => {
	evidence = await roundtripFixture();
});
afterAll(cleanPortableFixtures);
test("portable import preserves current bytes and exact retained identities without repository source", async () => {
	if (evidence === undefined) throw new Error("The round-trip fixture is unavailable.");
	const { source, current, retained, target, request, installed } = evidence;
	expect(installed.success).toBe(true);
	const reopened = readArchitectureModel(target.vault);
	expect(reopened.success).toBe(true);
	if (!reopened.success) throw new Error(JSON.stringify(reopened));
	expect(reopened.manifest).toEqual(current.manifest);
	expect(reopened.revision).toEqual(current.revision);
	expect(readFileSync(join(target.vault, "gateway.module.json"))).toEqual(
		readFileSync(join(source.vault, "gateway.module.json")),
	);
	const exact = await readArchitectureCheckpoint(target.vault, retained.checkpoint.id);
	expect(exact).toMatchObject({ success: true, sourceEvidence: [{ status: "unavailable" }] });
	expect(git(target.root, "rev-list", "--all", "--", "code.ts")).toBe("");
	expect(await importArchitectureModel(target.vault, request)).toEqual(installed);
});
test("portable history shares large exact inputs without changing source HEAD or index", async () => {
	const source = fixture();
	const head = git(source.root, "rev-parse", "HEAD");
	const index = readFileSync(join(source.root, ".git/index"));
	const file = join(source.vault, "gateway.module.json");
	const bytes = Buffer.concat([readFileSync(file), Buffer.alloc(8_000_000, " ")]);
	writeFileSync(file, bytes);
	const largeCurrent = readArchitectureModel(source.vault);
	if (!largeCurrent.success) throw new Error(JSON.stringify(largeCurrent));
	const retained = await retainArchitectureCheckpoint(source.vault, {
		target: "current",
		expectedRevision: largeCurrent.revision.digest,
		operationId: "shared-large-inputs",
		writer: "agent",
		doing: "retaining shared architecture inputs",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const tree = git(source.root, "rev-parse", `${retained.checkpoint.id}^{tree}`);
	let tip = retained.checkpoint.id;
	for (let sequence = 1; sequence < 110; sequence++)
		tip = git(
			source.root,
			"commit-tree",
			tree,
			"-p",
			tip,
			"-m",
			`test: retain shared inputs ${sequence}`,
		);
	git(source.root, "update-ref", "refs/heads/archboard-history", tip);
	const large = await exportArchitectureModel(source.vault);
	if (!large.success) throw new Error(JSON.stringify(large));
	expect(large.bundle.revision).toEqual(largeCurrent.revision);
	const encoded = large.bundle.inputs.find((input) => input.path === "gateway.module.json");
	if (encoded === undefined) throw new Error("The exported module is unavailable.");
	expect(Buffer.from(encoded.bytes, "base64")).toEqual(bytes);
	expect(git(source.root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(source.root, ".git/index"))).toEqual(index);
	const target = destination();
	const installed = await importArchitectureModel(target.vault, {
		bundle: large.bundle,
		expectedRevision: empty,
		operationId: "shared-large-import",
		writer: "agent",
		doing: "restoring shared retained inputs",
	});
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const first = await readArchitectureCheckpoint(target.vault, retained.checkpoint.id);
	const last = await readArchitectureCheckpoint(target.vault, tip);
	expect(first.success && first.revision).toEqual(largeCurrent.revision);
	expect(last.success && last.revision).toEqual(largeCurrent.revision);
});

test("portable imports retain synchronized histories as readable exact checkpoints", async () => {
	const source = fixture();
	const current = readArchitectureModel(source.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const request = {
		target: "current" as const,
		expectedRevision: current.revision.digest,
		operationId: "original-history",
		writer: "agent",
		doing: "retaining original architecture",
		dependencies: [],
	};
	const original = await retainArchitectureCheckpoint(source.vault, request);
	if (!original.success) throw new Error(JSON.stringify(original));
	git(source.root, "update-ref", "-d", "refs/heads/archboard-history");
	const file = join(source.vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(file, "utf8"));
	writeFileSync(file, JSON.stringify({ ...gateway, description: "Independent architecture." }));
	const changed = readArchitectureModel(source.vault);
	if (!changed.success) throw new Error(JSON.stringify(changed));
	const independent = await retainArchitectureCheckpoint(source.vault, {
		...request,
		operationId: "independent-history",
		expectedRevision: changed.revision.digest,
	});
	if (!independent.success) throw new Error(JSON.stringify(independent));
	expect(await retainArchitectureCheckpoint(source.vault, request)).toEqual(original);
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const installed = await importArchitectureModel(target.vault, {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "synchronized-import",
		writer: "agent",
		doing: "restoring synchronized history",
	});
	if (!installed.success) throw new Error(JSON.stringify(installed));
	expect(await readArchitectureCheckpoint(target.vault, installed.checkpoint.id)).toMatchObject({
		success: true,
		revision: changed.revision,
	});
	for (const checkpoint of [original.checkpoint, independent.checkpoint])
		expect(await readArchitectureCheckpoint(target.vault, checkpoint.id)).toMatchObject({
			success: true,
			revision: checkpoint.revision,
		});
	expect(await exportArchitectureModel(target.vault)).toMatchObject({ success: true });
});
