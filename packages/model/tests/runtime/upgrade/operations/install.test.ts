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
 * A Git checkout holding a vault written before sync and async replaced call: its kinds set an
 * arrowhead, a lens of its own names call, and its relationship states an effect.
 * @returns The vault.
 */
function callEraVault(): string {
	const vault = checkout();
	cpSync(resolve("tests/fixtures/current-format-vault"), vault, { recursive: true });
	const handler = join(vault, "internal/handler.module.json");
	writeFileSync(handler, readFileSync(handler, "utf8").replace('"kind": "sync"', '"kind": "call"'));
	writeFileSync(
		join(vault, ".archboard/config.yaml"),
		Bun.YAML.stringify({
			nodeKinds: {
				service: { name: "Service", icon: "RiServerLine" },
				module: { name: "Module", icon: "RiCodeBoxLine" },
			},
			relationshipKinds: { rpc: { name: "RPC", color: "violet", arrowhead: "filled" } },
			groups: { public: { name: "Public interface", color: "blue" } },
			lenses: { calls: { name: "Calls", show: [{ kind: "call", effect: "mutation" }] } },
		}),
	);
	return vault;
}

/**
 * The inventory of a vault, which must read.
 * @param vault The vault.
 * @param timing How each anchored call runs, if the code facts read it.
 * @returns Its inventories, by root module name.
 */
async function inventory(
	vault: string,
	timing?: Parameters<typeof readUpgradeInventory>[1],
): Promise<Map<string, UpgradeInventory>> {
	const read = await readUpgradeInventory(vault, timing);
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
	const written = [...inventories.values()];
	for (const entry of written.flatMap((one) => one.relationships))
		Object.assign(entry, filled[entry.id]);
	return written;
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
			kind: null,
			effect: null,
			gap: null,
		},
	]);
	// The retired kind starts empty, so nobody installs it unread.
	expect(inventories.get("Worker")!.relationships).toMatchObject([
		{ id: "Shop#Record", oldKind: "data", kind: null, effect: null },
	]);
});

test("a former call starts as async where its call is awaited or started, sync where it is plain, and empty otherwise", async () => {
	const vault = oldVault();
	const asked: unknown[] = [];
	for (const [timing, kind] of [
		["awaited", "async"],
		["started", "async"],
		["plain", "sync"],
		["unknown", null],
		[undefined, null],
	] as const) {
		const inventories = await inventory(vault, async (entry) => {
			asked.push(entry.anchor);
			return timing;
		});
		expect(inventories.get("Gateway")!.relationships[0]).toMatchObject({ oldKind: "call", kind });
		expect(inventories.get("Worker")!.relationships[0]).toMatchObject({
			oldKind: "data",
			kind: null,
		});
	}
	// Only the former call is asked about, by its anchor.
	expect(new Set(asked.map((anchor) => JSON.stringify(anchor)))).toEqual(
		new Set([
			JSON.stringify({ repo: "github.com/acme/shop", path: "src/gateway.ts", symbol: "dispatch" }),
		]),
	);
	expect(asked).toHaveLength(5);
});

test("installing an inventory that leaves an effect out is refused, naming each relationship, and nothing changes", async () => {
	const vault = oldVault();
	const before = readFileSync(join(vault, "internal/handler.module.json"));
	const refused = await upgradeArchitectureModel(vault, {
		inventories: fill(await inventory(vault), {
			"Shop#Dispatch": { kind: "sync", effect: null },
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

test("a relationship that keeps a retired kind is refused with its ways out", async () => {
	const vault = oldVault();
	const refused = await upgradeArchitectureModel(vault, {
		inventories: fill(await inventory(vault), {
			"Shop#Dispatch": { kind: "call", effect: "mutation" },
			"Shop#Record": { kind: "other", effect: "mutation" },
		}),
		writer: "test-agent",
		doing: "upgrading the vault",
	});
	if (refused.success) throw new Error("The upgrade was not refused.");
	const messages = new Map(refused.diagnostics.map((one) => [one.subjects?.[0], one.message]));
	expect(messages.get("Shop#Record")).toContain(
		"keeps the retired kind other: use the kind that says how it travels, or add a kind of the vault's own",
	);
	expect(messages.get("Shop#Dispatch")).toMatch(
		/keeps the retired kind call: use sync .* or async/u,
	);
});

test("installing a complete inventory writes the current format, keeps every id, and lists its gaps", async () => {
	const vault = oldVault();
	const old = readArchitectureModel(vault);
	if (!old.success) throw new Error(JSON.stringify(old));
	const inventories = fill(await inventory(vault), {
		"Shop#Dispatch": { kind: "sync", effect: "mutation" },
		"Shop#Record": { kind: "storage", effect: "mutation" },
	});
	for (const entry of inventories.flatMap((one) => one.relationships))
		if (entry.id === "Shop#Record") entry.gap = "The store client is generated.";
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
		{ id: "Shop#Dispatch", kind: "sync", effect: "mutation" },
	]);
	expect(upgraded.relationships.map(({ id }) => id)).toEqual(old.relationships.map(({ id }) => id));
	// The retired kinds go, the vault's own name for calls with them, and so does every dash.
	expect(Bun.YAML.parse(readFileSync(join(vault, ".archboard/config.yaml"), "utf8"))).toMatchObject(
		{ relationshipKinds: {} },
	);
	expect(Object.keys(upgraded.policy.relationshipKinds)).not.toContain("data");
	expect(Object.keys(upgraded.policy.relationshipKinds)).not.toContain("call");
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
			"Shop#Dispatch": { kind: "sync", effect: "mutation" },
			"Shop#Record": { kind: "storage", effect: "mutation" },
			"Shop#Ack": { kind: "async", effect: "compute" },
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
		{ id: "Shop#Ack", kind: "async", effect: "compute" },
		{ id: "Shop#Dispatch", kind: "sync", effect: "mutation" },
	]);
});

test("a vault that still names call opens read-only in its own vocabulary, and the upgrade keeps each effect", async () => {
	const vault = callEraVault();
	const old = readArchitectureModel(vault);
	if (!old.success) throw new Error(JSON.stringify(old));
	expect(old.readOnly).toMatchObject({ code: "UPGRADE_REQUIRED" });
	expect(old.policy.relationshipKinds["call"]).toMatchObject({ arrowhead: "filled" });
	const inventories = await inventory(vault, async () => "awaited");
	expect(inventories.get("Gateway")!.relationships).toMatchObject([
		{ id: "Shop#Dispatch", oldKind: "call", kind: "async", effect: "mutation" },
	]);
	const installed = await upgradeArchitectureModel(vault, {
		inventories: [...inventories.values()],
		writer: "test-agent",
		doing: "upgrading the vault",
	});
	expect(installed).toMatchObject({ success: true });
	const upgraded = readArchitectureModel(vault);
	if (!upgraded.success) throw new Error(JSON.stringify(upgraded));
	expect(upgraded.readOnly).toBeUndefined();
	expect(upgraded.relationships.map(({ id, kind, effect }) => ({ id, kind, effect }))).toEqual([
		{ id: "Shop#Dispatch", kind: "async", effect: "mutation" },
	]);
	// A kind's arrowhead goes, and a lens that named call names sync and async.
	expect(Bun.YAML.parse(readFileSync(join(vault, ".archboard/config.yaml"), "utf8"))).toMatchObject(
		{
			relationshipKinds: { rpc: { name: "RPC", color: "violet" } },
			lenses: {
				calls: {
					name: "Calls",
					show: [
						{ kind: "sync", effect: "mutation" },
						{ kind: "async", effect: "mutation" },
					],
				},
			},
		},
	);
	expect(upgraded.policy.relationshipKinds["rpc"]).not.toHaveProperty("arrowhead");
});
