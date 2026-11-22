import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureModel, readUpgradeInventory } from "@archboard/model/store-read";
import { importArchitectureModel, upgradeArchitectureModel } from "@archboard/model/store-write";
import type { UpgradeInventory } from "@archboard/model/contract";
import { temporaryHome } from "#tests/runtime/support/temporary-home.ts";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

/**
 * A Git checkout holding a copy of the old-format fixture vault.
 * @returns The vault.
 */
function oldVault(): string {
	const vault = checkout();
	cpSync(resolve("tests/fixtures/old-format-vault"), vault, { recursive: true });
	return vault;
}

/**
 * An empty vault in a fresh Git checkout.
 * @returns The vault.
 */
function checkout(): string {
	const home = temporaryHome("archboard-upgrade-");
	homes.push(home);
	const vault = join(home, "repo", ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	const repo = join(home, "repo");
	const key = join(home, "signing-key");
	const generated = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]);
	if (generated.exitCode !== 0) throw new Error(generated.stderr.toString());
	for (const args of [
		["init", "--quiet", "--initial-branch=main"],
		["config", "user.name", "Upgrade Author"],
		["config", "user.email", "upgrade@example.test"],
		["config", "gpg.format", "ssh"],
		["config", "user.signingkey", key],
		["config", "commit.gpgsign", "true"],
	]) {
		const git = Bun.spawnSync(["git", "-C", repo, ...args]);
		if (git.exitCode !== 0) throw new Error(git.stderr.toString());
	}
	return vault;
}

/**
 * The inventory of a vault, which must read.
 * @param vault The vault.
 * @returns Its inventories, by root module name.
 */
async function inventory(vault: string): Promise<Map<string, UpgradeInventory>> {
	const read = await readUpgradeInventory(vault);
	if (!read.success) throw new Error(JSON.stringify(read));
	return new Map(read.inventories.map((one) => [one.root.name, one]));
}

/**
 * The inventories with a kind and an effect filled in for each relationship.
 * @param inventories The inventories as written.
 * @param filled The kind and effect of each relationship, by id.
 * @returns The filled inventories.
 */
function fill(
	inventories: Map<string, UpgradeInventory>,
	filled: Record<string, { kind: string; effect: "mutation" | "query" | "compute" | null }>,
): UpgradeInventory[] {
	return [...inventories.values()].map((one) => ({
		...one,
		relationships: one.relationships.map((entry) => ({ ...entry, ...filled[entry.id] })),
	}));
}

test("the inventory lists every relationship of an old vault under the root module of its source", async () => {
	const inventories = await inventory(oldVault());
	expect([...inventories.keys()].toSorted()).toEqual(["Gateway", "Worker"]);
	expect(inventories.get("Gateway")!.relationships).toMatchObject([
		{
			id: "Shop#Dispatch",
			from: { id: "Shop#Handler" },
			to: { id: "Shop#Worker" },
			anchor: { path: "src/gateway.ts", symbol: "dispatch" },
			oldKind: "call",
			kind: "call",
			effect: null,
			gap: null,
		},
	]);
	// The retired kind starts empty, so nobody installs it unread.
	expect(inventories.get("Worker")!.relationships).toMatchObject([
		{ id: "Shop#Record", oldKind: "data", kind: null, effect: null },
	]);
});

test("installing an inventory that leaves an effect out is refused, naming each relationship, and nothing changes", async () => {
	const vault = oldVault();
	const before = readFileSync(join(vault, "internal/handler.module.json"));
	const refused = await upgradeArchitectureModel(vault, {
		inventories: fill(await inventory(vault), {
			"Shop#Record": { kind: "storage", effect: null },
		}),
		writer: "test-agent",
		doing: "upgrading the vault",
	});
	expect(refused).toMatchObject({ success: false, code: "INVENTORY_INCOMPLETE" });
	if (refused.success) throw new Error("The upgrade was not refused.");
	expect(refused.diagnostics.flatMap((diagnostic) => diagnostic.subjects).toSorted()).toEqual([
		"Shop#Dispatch",
		"Shop#Record",
	]);
	expect(readFileSync(join(vault, "internal/handler.module.json"))).toEqual(before);
	expect(readArchitectureModel(vault)).toMatchObject({ readOnly: { code: "UPGRADE_REQUIRED" } });
});

test("installing a complete inventory writes the current format, keeps every id, and lists its gaps", async () => {
	const vault = oldVault();
	const old = readArchitectureModel(vault);
	if (!old.success) throw new Error(JSON.stringify(old));
	const inventories = fill(await inventory(vault), {
		"Shop#Dispatch": { kind: "call", effect: "mutation" },
		"Shop#Record": { kind: "storage", effect: "mutation" },
	}).map((one) => ({
		...one,
		relationships: one.relationships.map((entry) =>
			entry.id === "Shop#Record" ? { ...entry, gap: "The store client is generated." } : entry,
		),
	}));
	const request = { inventories, writer: "test-agent", doing: "upgrading the vault" };
	const installed = await upgradeArchitectureModel(vault, request);
	expect(installed).toMatchObject({
		success: true,
		gaps: [{ id: "Shop#Record", gap: "The store client is generated." }],
	});
	const upgraded = readArchitectureModel(vault);
	if (!upgraded.success) throw new Error(JSON.stringify(upgraded));
	expect(upgraded.readOnly).toBeUndefined();
	expect(upgraded.modules.map((module) => module.schemaVersion)).toEqual([2, 2, 2]);
	expect(upgraded.relationships.map(({ id, kind, effect }) => ({ id, kind, effect }))).toEqual([
		{ id: "Shop#Record", kind: "storage", effect: "mutation" },
		{ id: "Shop#Dispatch", kind: "call", effect: "mutation" },
	]);
	expect(upgraded.relationships.map(({ id }) => id)).toEqual(old.relationships.map(({ id }) => id));
	// The vault's own name for calls stays; the retired kind and every dash go.
	expect(Bun.YAML.parse(readFileSync(join(vault, ".archboard/config.yaml"), "utf8"))).toMatchObject(
		{ relationshipKinds: { call: { name: "Calls", arrowhead: "filled" } } },
	);
	expect(Object.keys(upgraded.policy.relationshipKinds)).not.toContain("data");
	// Installing the same inventory again answers with the same receipt.
	const again = await upgradeArchitectureModel(vault, request);
	expect(again).toMatchObject({
		success: true,
		checkpoint: { id: installed.success ? installed.checkpoint.id : "" },
	});
});

test("a draft moves onto the upgraded state: it reads in the current format, and is not behind it", async () => {
	const vault = checkout();
	const request = JSON.parse(
		readFileSync(resolve("tests/fixtures/old-format-draft.import.json"), "utf8"),
	);
	for (const { path, bytes } of request.bundle.inputs as { path: string; bytes: string }[]) {
		mkdirSync(join(vault, path, ".."), { recursive: true });
		writeFileSync(join(vault, path), Buffer.from(bytes, "base64"));
	}
	const restored = await importArchitectureModel(vault, request);
	if (!restored.success) throw new Error(JSON.stringify(restored));
	const inventories = await inventory(vault);
	expect(inventories.get("Worker")!.relationships).toMatchObject([
		{ id: "Shop#Record" },
		{ id: "Shop#Ack", proposal: "Queue", oldKind: "call" },
	]);
	const installed = await upgradeArchitectureModel(vault, {
		inventories: fill(inventories, {
			"Shop#Dispatch": { kind: "call", effect: "mutation" },
			"Shop#Record": { kind: "storage", effect: "mutation" },
			"Shop#Ack": { kind: "call", effect: "compute" },
		}),
		writer: "test-agent",
		doing: "upgrading the vault",
	});
	expect(installed).toMatchObject({ success: true });
	const draft = await readArchitectureModel(vault, undefined, undefined, { state: "Queue" });
	if (!draft.success) throw new Error(JSON.stringify(draft));
	expect(draft.readOnly).toBeUndefined();
	expect(draft.relationships.map(({ id, kind, effect }) => ({ id, kind, effect }))).toEqual([
		{ id: "Shop#Record", kind: "storage", effect: "mutation" },
		{ id: "Shop#Ack", kind: "call", effect: "compute" },
		{ id: "Shop#Dispatch", kind: "call", effect: "mutation" },
	]);
});
