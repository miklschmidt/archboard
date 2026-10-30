import { beforeAll, afterAll, expect, test } from "bun:test";
import { readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	editArchitectureModule,
} from "@archboard/board/store-write";
import { fixture, git } from "../model-edit/fixture.ts";
import { proposal, request, selected } from "../proposals/fixture.ts";
import { destination, empty, cleanPortableFixtures } from "./portable-fixture.ts";

async function historyFixture() {
	const source = fixture();

	const draft = await proposal(source.vault, "Alternative", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Original alternative." } },
	]);
	const shelved = await editArchitectureModule(source.vault, {
		...(await request(source.vault, draft.target.state!)),
		proposal: { type: "shelve", reason: "Keep the alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const corrected = await editArchitectureModule(source.vault, {
		...(await request(source.vault, draft.target.state!)),
		correction: {
			previous: shelved.checkpoint.id,
			reason: "Correct the source account.",
			revisions: [{ repo: "github.com/acme/shop", commit: git(source.root, "rev-parse", "HEAD") }],
		},
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Corrected alternative." },
			},
		],
	});
	if (!corrected.success) throw new Error(JSON.stringify(corrected));
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));

	return { draft, shelved, corrected, exported };
}
let evidence: Awaited<ReturnType<typeof historyFixture>> | undefined;
beforeAll(async () => {
	evidence = await historyFixture();
}, 15000);
afterAll(cleanPortableFixtures);
test("completed decisions and corrections remain discoverable after portable import", async () => {
	if (evidence === undefined) throw new Error("The retained fixture is unavailable.");
	const { draft, shelved, corrected, exported } = evidence;
	const target = destination();
	const installed = await importArchitectureModel(target.vault, {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "history-import",
		writer: "agent",
		doing: "restoring architecture decisions",
	});
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const logical = await selected(target.vault, draft.target.state!);
	expect(logical.selectedState).toMatchObject({
		id: draft.target.state,
		lifecycle: "shelved",
		reason: "Keep the alternative.",
		corrections: [{ checkpoint: corrected.checkpoint.id, previous: shelved.checkpoint.id }],
	});
	expect(logical.modules.find((m) => m.id === "Shop#Gateway")?.description).toBe(
		"Corrected alternative.",
	);
	const exact = await readArchitectureCheckpoint(target.vault, shelved.checkpoint.id);
	expect(exact.success && exact.modules.find((m) => m.id === "Shop#Gateway")?.description).toBe(
		"Original alternative.",
	);
}, 15000);
