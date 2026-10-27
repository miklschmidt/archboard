import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { editArchitectureModule, retainArchitectureCheckpoint } from "@archboard/board/store-write";
import { listArchitectureCheckpoints } from "@archboard/board/store-read";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("narrative families inherit safe fields and settle disputed text, reading, and beat order together", async () => {
	const { vault } = fixture();
	seedTour(vault);
	const source = (await selected(vault, "Current")).walkthroughs[0]!;
	const [a, b, c] = source.beats;
	const draft = await proposal(vault, "Alternative tour", "Current", [
		{
			type: "edit-walkthrough",
			subject: source.id,
			beats: [
				b!,
				{
					...a!,
					narrative: "The proposal explains the gateway.",
					reading: { ...a!.reading, focus: ["Shop#Gateway"] },
				},
				c!,
			],
		},
	]);
	const changed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{
				type: "edit-walkthrough",
				subject: source.id,
				beats: [
					{
						...a!,
						narrative: "The predecessor explains the worker.",
						reading: { ...a!.reading, focus: ["Shop#Worker"] },
					},
					c!,
					{ ...b!, title: "Inherited title" },
				],
			},
		],
	});
	expect(changed).toMatchObject({ success: true, reconciliation: true });
	const conflicted = await selected(vault, draft.target.state!);
	const following = conflicted.walkthroughs[0]!;
	expect(following.beats.map((beat) => beat.id)).toEqual([b!.id, a!.id, c!.id]);
	expect(following.beats[0]!.title).toBe("Inherited title");
	const issues = conflicted.selectedState!.standing!.issues;
	expect(issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: a!.id, field: "narrative", kind: "competing-field" }),
			expect.objectContaining({ subject: a!.id, field: "reading", kind: "competing-field" }),
			expect.objectContaining({ kind: "competing-order" }),
		]),
	);
	const settled = await editArchitectureModule(vault, {
		...(await request(vault, draft.target.state!)),
		proposal: {
			type: "settle",
			resolutions: issues.map((issue) => ({
				subject: issue.subject,
				...(issue.field === undefined ? {} : { field: issue.field }),
				take: "theirs" as const,
			})),
		},
		changes: [],
	});
	expect(settled).toMatchObject({ success: true, reconciliation: false });
	const resolved = await selected(vault, draft.target.state!);
	expect(resolved.selectedState).not.toHaveProperty("standing");
	expect(resolved.walkthroughs[0]!.beats.map((beat) => beat.id)).toEqual([a!.id, c!.id, b!.id]);
	expect(resolved.walkthroughs[0]!.beats[0]).toMatchObject({
		narrative: "The predecessor explains the worker.",
		reading: { focus: ["Shop#Worker"] },
	});
}, 15_000);

function seedTour(vault: string) {
	writeFileSync(
		join(vault, "tour.walkthrough.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Tour",
			name: "Tour",
			target: { state: "current" },
			beats: ["First", "Second", "Third"].map((title) => ({
				id: `Shop#${title}`,
				title,
				narrative: `Read ${title}.`,
				reading: { grammar: "architecture" },
			})),
		}),
	);
}

test("family checkpoints retain the exact targets kept only by a following narrative", async () => {
	const { vault } = fixture();
	seedTour(vault);
	const source = await selected(vault, "Current");
	const target = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId: "tour-origin",
		writer: "agent",
		doing: "retain the original tour target",
		expectedRevision: source.revision.digest,
		dependencies: [],
	});
	if (!target.success) throw new Error(JSON.stringify(target));
	await proposal(vault, "Pinned tour", "Current", [
		{
			type: "edit-walkthrough",
			subject: source.walkthroughs[0]!.id,
			set: { target: { checkpoint: target.checkpoint.id } },
		},
	]);
	const advanced = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Accepts the newer request." },
			},
		],
	});
	if (!advanced.success) throw new Error(JSON.stringify(advanced));
	const retained = await listArchitectureCheckpoints(vault);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const records = new Map(retained.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
	const pending = [advanced.checkpoint.id],
		reachable = new Set<string>();
	while (pending.length > 0) {
		const id = pending.pop()!;
		if (reachable.has(id)) continue;
		reachable.add(id);
		pending.push(...(records.get(id)?.request.dependencies ?? []));
	}
	expect(reachable).toContain(target.checkpoint.id);
}, 15_000);
