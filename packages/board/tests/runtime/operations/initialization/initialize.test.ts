import { afterEach, expect, test } from "bun:test";
import { rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { initializeArchitectureModel } from "@archboard/board/store-write";
import { fixture, git, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("initialization creates one canonical planning model, retains its identity on retry, and preserves source Git", async () => {
	const { root, vault } = fixture();
	rmSync(vault, { recursive: true });
	mkdirSync(vault);
	const head = git(root, "rev-parse", "HEAD");
	const index = readFileSync(join(root, ".git/index"));
	const request = { name: "Shop", operationId: "initialize-shop", writer: "agent", doing: "Initialize architecture" };
	const result = await initializeArchitectureModel(vault, request);
	expect(result).toMatchObject({ success: true });
	const reading = readArchitectureModel(vault);
	expect(reading).toMatchObject({ success: true, manifest: { name: "Shop", current: null }, modules: [], roots: [] });
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.manifest.id).toMatch(/^[A-Za-z0-9]{8}$/u);
	expect(await initializeArchitectureModel(vault, request)).toEqual(result);
	expect(readArchitectureModel(vault)).toEqual(reading);
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await initializeArchitectureModel(vault, { ...request, name: "Other" })).toMatchObject({ success: false, code: "OPERATION_REUSED" });
	expect(await initializeArchitectureModel(vault, { ...request, operationId: "replace" })).toMatchObject({ success: false, code: "TARGET_CHANGED" });
});

test("initialization refuses legacy authority without rewriting its exact bytes", async () => {
	const { vault } = fixture();
	rmSync(vault, { recursive: true });
	mkdirSync(vault);
	const original = '{"old":"preserve exactly"}\n';
	writeFileSync(join(vault, "old.semantic.json"), original);
	expect(await initializeArchitectureModel(vault, { name: "Shop", operationId: "init", writer: "agent", doing: "Initialize architecture" })).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
	expect(readFileSync(join(vault, "old.semantic.json"), "utf8")).toBe(original);
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
});
