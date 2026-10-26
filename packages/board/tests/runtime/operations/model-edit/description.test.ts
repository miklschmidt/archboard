import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { claimArchitectureSubjects, editArchitectureModule } from "@archboard/board/store-write";

import { fixture, git, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("one claimed description edit retains its outcome without changing other authored files or the index", async () => {
	const { root, vault } = fixture();
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "explaining the gateway",
		subjects: ["Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const untouched = current.revision.files
		.filter((f) => f.path !== "gateway.module.json")
		.map((f) => [f.path, readFileSync(join(vault, f.path))] as const);
	const index = readFileSync(join(root, ".git/index"));
	const input = {
		target,
		subject: "Shop#Gateway",
		expectedRevision: current.revision,
		operationId: "explain-1",
		writer: "agent",
		doing: "explaining request routing",
		claim: claimed.claim.id,
		description: "Routes authenticated requests through the worker.",
	};
	const result = await editArchitectureModule(vault, input);
	expect(result).toMatchObject({
		success: true,
		applied: true,
		reconciliation: false,
		subjects: ["Shop#Gateway"],
		before: current.revision,
		cleanup: "complete",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	const after = readArchitectureModel(vault, "Shop#Gateway");
	expect(after).toMatchObject({
		success: true,
		revision: result.after,
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", description: input.description }),
		]),
	});
	expect(
		await readArchitectureCheckpoint(vault, result.checkpoint.id, "Shop#Gateway"),
	).toMatchObject(after);
	for (const [file, bytes] of untouched) expect(readFileSync(join(vault, file))).toEqual(bytes);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await editArchitectureModule(vault, input)).toEqual(result);
	expect(
		await editArchitectureModule(vault, { ...input, description: "Another intent" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
});

test("a completed request remains idempotent after its private result file is lost", async () => {
	const { root, vault } = fixture();
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "explaining the gateway",
		subjects: ["Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const input = {
		target,
		subject: "Shop#Gateway",
		expectedRevision: current.revision,
		operationId: "lost-private-result",
		writer: "agent",
		doing: "explaining request routing",
		claim: claimed.claim.id,
		description: "A retained description.",
	};
	const result = await editArchitectureModule(vault, input);
	if (!result.success) throw new Error(JSON.stringify(result));
	const tip = git(root, "rev-parse", "refs/heads/archboard-history");
	const { readdirSync } = await import("node:fs");
	for (const file of readdirSync(join(vault, ".archboard/runtime")))
		if (file.startsWith("outcome-")) rmSync(join(vault, ".archboard/runtime", file));
	expect(await editArchitectureModule(vault, input)).toEqual(result);
	expect(git(root, "rev-parse", "refs/heads/archboard-history")).toBe(tip);
});
