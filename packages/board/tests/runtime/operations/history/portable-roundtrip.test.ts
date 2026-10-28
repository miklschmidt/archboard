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
test("portable export preserves large valid input bytes without changing source HEAD or index", async () => {
	const source = fixture();
	const head = git(source.root, "rev-parse", "HEAD");
	const index = readFileSync(join(source.root, ".git/index"));
	const file = join(source.vault, "gateway.module.json");
	const bytes = Buffer.concat([readFileSync(file), Buffer.alloc(8_000_000, " ")]);
	writeFileSync(file, bytes);
	const largeCurrent = readArchitectureModel(source.vault);
	if (!largeCurrent.success) throw new Error(JSON.stringify(largeCurrent));
	const large = await exportArchitectureModel(source.vault);
	if (!large.success) throw new Error(JSON.stringify(large));
	expect(large.bundle.revision).toEqual(largeCurrent.revision);
	const encoded = large.bundle.inputs.find((input) => input.path === "gateway.module.json");
	if (encoded === undefined) throw new Error("The exported module is unavailable.");
	expect(Buffer.from(encoded.bytes, "base64")).toEqual(bytes);
	expect(git(source.root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(source.root, ".git/index"))).toEqual(index);
});
