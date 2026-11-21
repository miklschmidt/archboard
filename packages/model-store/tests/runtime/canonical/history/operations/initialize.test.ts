import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import { rmSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { modelShape, parseModelRequest } from "@archboard/model-contract";
import { installArchitectureModel, readArchitectureModel } from "@archboard/model-store";
import { fixture, git, disposeFixtures } from "#tests/runtime/canonical/edit/operations/fixture.ts";

const untracked: string[] = [];
afterEach(() => {
	disposeFixtures();
	for (const root of untracked.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("initialization creates one canonical planning model, retains its identity on retry, and preserves source Git", async () => {
	const { root, vault } = fixture();
	rmSync(vault, { recursive: true });
	mkdirSync(vault);
	const head = git(root, "rev-parse", "HEAD");
	const index = readFileSync(join(root, ".git/index"));
	const request = {
		name: "Shop",
		operationId: "initialize-shop",
		writer: "agent",
		doing: "Initialize architecture",
	};
	const result = await installArchitectureModel(vault, request);
	expect(result).toMatchObject({ success: true });
	const reading = readArchitectureModel(vault);
	expect(reading).toMatchObject({
		success: true,
		manifest: { name: "Shop", current: null },
		modules: [],
		roots: [],
	});
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.manifest.id).toMatch(/^[A-Za-z0-9]{8}$/u);
	expect(await installArchitectureModel(vault, request)).toEqual(result);
	expect(readArchitectureModel(vault)).toEqual(reading);
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await installArchitectureModel(vault, { ...request, name: "Other" })).toMatchObject({
		success: false,
		code: "OPERATION_REUSED",
	});
	expect(
		await installArchitectureModel(vault, { ...request, operationId: "replace" }),
	).toMatchObject({ success: false, code: "TARGET_CHANGED" });
});

test("a direct initialization that names a vault is refused as the strict schema refuses it, though a route reads it", async () => {
	const { vault } = fixture();
	rmSync(vault, { recursive: true });
	mkdirSync(vault);
	const named = {
		vault,
		name: "Shop",
		operationId: "init",
		writer: "agent",
		doing: "Initialize architecture",
	};
	expect(parseModelRequest("initialize", named)).toMatchObject({ success: true, vault });
	const strict = modelShape("initializationRequest").safeParse(named);
	if (strict.success) throw new Error("The strict schema read a stray vault.");
	await expect(installArchitectureModel(vault, named)).rejects.toMatchObject({
		name: "ZodError",
		issues: strict.error.issues,
	});
	expect(readdirSync(vault)).toEqual([]);
});

test("initialization refuses legacy authority without rewriting its exact bytes", async () => {
	const { vault } = fixture();
	rmSync(vault, { recursive: true });
	mkdirSync(vault);
	const original = '{"old":"preserve exactly"}\n';
	writeFileSync(join(vault, "old.semantic.json"), original);
	expect(
		await installArchitectureModel(vault, {
			name: "Shop",
			operationId: "init",
			writer: "agent",
			doing: "Initialize architecture",
		}),
	).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
	expect(readFileSync(join(vault, "old.semantic.json"), "utf8")).toBe(original);
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
});

test("initialization refuses an untracked legacy vault before it needs an archive", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-untracked-legacy-"));
	untracked.push(root);
	const vault = join(root, ".archboard/vault");
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(vault, "old.semantic.json"), "legacy bytes");
	expect(
		await installArchitectureModel(vault, {
			name: "Shop",
			operationId: "init",
			writer: "agent",
			doing: "Initialize architecture",
		}),
	).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
});
