import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { ArchitectureModuleEditSchema } from "@archboard/board/model";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

const originalRegistry = process.env["ARCHBOARD_REPOS"];
afterEach(() => {
	if (originalRegistry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = originalRegistry;
	disposeFixtures();
});

test("corrections require completed targets, immutable evidence and the exact prior logical reading", async () => {
	const { root, vault } = fixture();
	// The unknown source must not inspect the host's registered checkouts.
	process.env["ARCHBOARD_REPOS"] = join(root, "repos.json");
	const created = await proposal(vault, "Parked");
	const correction = {
		previous: created.checkpoint.id,
		reason: "Correct the recorded routing.",
		revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
	};
	const changes = [
		{
			type: "edit-module" as const,
			subject: "Shop#Gateway",
			set: { description: "Accurate routing." },
		},
	];
	const draft = { ...(await request(vault, created.target.state!)), correction, changes };
	expect(await editArchitectureModule(vault, draft)).toMatchObject({
		success: false,
		code: "TARGET_CHANGED",
		applied: false,
	});
	const current = { ...(await request(vault)), correction, changes };
	expect(await editArchitectureModule(vault, current)).toMatchObject({
		success: false,
		code: "TARGET_CHANGED",
		applied: false,
	});
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, created.target.state!)),
		proposal: { type: "shelve", reason: "Keep the alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const base = await request(vault, created.target.state!);
	const input = {
		...base,
		correction: { ...correction, previous: shelved.checkpoint.id },
		changes,
	};
	expect(
		ArchitectureModuleEditSchema.safeParse({
			...input,
			correction: { ...input.correction, reason: " " },
		}).success,
	).toBe(false);
	expect(
		ArchitectureModuleEditSchema.safeParse({
			...input,
			correction: { ...input.correction, revisions: [] },
		}).success,
	).toBe(false);
	expect(await editArchitectureModule(vault, { ...base, changes })).toMatchObject({
		success: false,
		code: "TARGET_CHANGED",
		applied: false,
	});
	const before = readArchitectureModel(vault);
	expect(
		await editArchitectureModule(vault, {
			...input,
			correction: {
				...input.correction,
				revisions: [{ repo: "github.com/acme/shop", commit: "f".repeat(40) }],
			},
		}),
	).toMatchObject({ success: false, code: "SOURCE_EVIDENCE_UNAVAILABLE", applied: false });
	expect(
		await editArchitectureModule(vault, {
			...input,
			correction: {
				...input.correction,
				revisions: [{ repo: "github.com/acme/other", commit: correction.revisions[0]!.commit }],
			},
		}),
	).toMatchObject({ success: false, code: "SOURCE_EVIDENCE_UNAVAILABLE", applied: false });
	expect(readArchitectureModel(vault)).toEqual(before);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Gateway" } }],
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID", applied: false });
	expect(
		await editArchitectureModule(vault, {
			...input,
			operationId: crypto.randomUUID(),
			changes: [
				{
					type: "add-walkthrough",
					walkthrough: {
						name: "Corrected tour",
						target: { checkpoint: "f".repeat(40) },
						beats: [
							{
								title: "Recorded routing",
								narrative: "Read the recorded gateway.",
								reading: { grammar: "architecture" },
							},
						],
					},
				},
			],
		}),
	).toMatchObject({ success: false, applied: false });
	const result = await editArchitectureModule(vault, input);
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(
		await editArchitectureModule(vault, { ...input, operationId: crypto.randomUUID() }),
	).toMatchObject({ success: false, code: "STALE_REVISION", applied: false });
	expect(
		await editArchitectureModule(vault, {
			...input,
			correction: { ...input.correction, reason: "Another request." },
		}),
	).toMatchObject({ success: false, code: "OPERATION_REUSED", applied: false });
	expect((await selected(vault, created.target.state!)).selectedState?.corrections).toHaveLength(1);
}, 20_000);
