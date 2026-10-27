import { beforeAll, afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
	return { source, current, retained, exported };
}
let evidence: Awaited<ReturnType<typeof roundtripFixture>> | undefined;
beforeAll(async () => {
	evidence = await roundtripFixture();
});
afterAll(cleanPortableFixtures);
test("portable import preserves current bytes and exact retained identities without repository source", async () => {
	if (evidence === undefined) throw new Error("The round-trip fixture is unavailable.");
	const { source, current, retained, exported } = evidence;
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
