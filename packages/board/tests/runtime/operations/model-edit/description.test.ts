import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
	if (!after.success) throw new Error(JSON.stringify(after));
	expect(after).toMatchObject({
		success: true,
		revision: result.after,
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", description: input.description }),
		]),
	});
	expect(
		await readArchitectureCheckpoint(vault, result.checkpoint.id, "Shop#Gateway"),
	).toMatchObject({ ...after, selectedState: { ...after.selectedState, lifecycle: "historical" } });
	for (const [file, bytes] of untouched) expect(readFileSync(join(vault, file))).toEqual(bytes);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await editArchitectureModule(vault, input)).toEqual(result);
	expect(
		await editArchitectureModule(vault, { ...input, description: "Another intent" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
});

test("a completed retry preserves its retained checkpoint after current inputs become invalid", async () => {
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
	const { writeFileSync } = await import("node:fs");
	writeFileSync(join(vault, "gateway.module.json"), "{");

	expect(await editArchitectureModule(vault, input)).toEqual(result);
	expect(git(root, "rev-parse", "refs/heads/archboard-history")).toBe(tip);
});

test("configured signing failure changes no current file, HEAD, index or accepted checkpoint", async () => {
	const { root, vault } = fixture();
	const { intent } = await import("#tests/runtime/operations/model-edit/fixture.ts");
	const input = await intent(vault, "signing-refusal");
	const before = readArchitectureModel(vault);
	const index = readFileSync(join(root, ".git/index"));
	const head = git(root, "rev-parse", "HEAD");
	git(root, "config", "gpg.format", "ssh");
	git(root, "config", "commit.gpgsign", "true");
	git(root, "config", "user.signingkey", join(root, "missing-key"));
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		applied: false,
		reconciliation: false,
	});
	expect(readArchitectureModel(vault)).toEqual(before);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(git(root, "config", "--get", "commit.gpgsign")).toBe("true");
});

test("the complete token includes policy bytes and discovered paths, even when its digest field is unchanged", async () => {
	const { vault } = fixture();
	const { intent, readBytes } = await import("#tests/runtime/operations/model-edit/fixture.ts");
	const input = await intent(vault, "stale-1");
	const before = readBytes(vault);
	expect(
		await editArchitectureModule(vault, {
			...input,
			expectedRevision: { ...input.expectedRevision, files: input.expectedRevision.files.slice(1) },
		}),
	).toMatchObject({
		success: false,
		code: "STALE_REVISION",
		diagnostics: expect.arrayContaining([expect.objectContaining({ subjects: [input.subject] })]),
	});
	const policy = join(vault, ".archboard/config.yaml");
	const { writeFileSync } = await import("node:fs");
	writeFileSync(policy, `${readFileSync(policy, "utf8")}\n`);
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: false,
		code: "STALE_REVISION",
	});
	expect(readBytes(vault)).toEqual(before);
});
