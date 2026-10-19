import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

// The public path to a container's interface: state a board with a container
// in it, and ask the command line what its interface is. The pure derivation
// owns the semantics (packages/board/tests); this owner is for the
// claim that a command with no browser answers them, in an answer that its own
// schema accepts, and refuses what names no container.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-container-interface-"));
const vault = vaultIn(holder);
let server: OwnedServer;

/**
 * Run one archboard command against the owned server.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runServerCli({ repoRoot, server, args, input });

/** Server calls into the store's index; Cron depends on the whole store. */
const ARCHITECTURE = {
	level: "system",
	nodes: [
		{ name: "Store", kind: "service" },
		{ name: "Server", kind: "route" },
		{ name: "Cron", kind: "job" },
		{ name: "Disk", kind: "datastore" },
		{ name: "Index", kind: "function", parent: "Store" },
		{ name: "Ledger", kind: "function", parent: "Store" },
		{ name: "Cache", kind: "function", parent: "Store" },
		{ name: "Client one", kind: "route" },
		{ name: "Client two", kind: "route" },
	],
	edges: [
		{ from: "Server", to: "Index", kind: "http", label: "lookup" },
		{ from: "Cron", to: "Store", kind: "event" },
		{ from: "Index", to: "Ledger", kind: "data" },
		{ from: "Ledger", to: "Disk", kind: "data", label: "append" },
	],
};

beforeAll(async () => {
	server = await startOwnedServer({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

/**
 * The names of some nodes of an answer.
 * @param nodes The nodes.
 * @returns Their names, in order.
 */
const namesOf = (nodes: readonly { name: string }[]): string[] => nodes.map((node) => node.name);

describe("inspecting a container from the command line", () => {
	test("entry points, hidden parts, callers and outgoing relationships come back, by name or by id", () => {
		const created = cli(
			["semantic", "new", "shop", "--doing", "drawing the store"],
			JSON.stringify(ARCHITECTURE),
		);
		expect(created.status, created.stderr).toBe(0);

		const first = cli(["semantic", "inspect", "shop", "--container", "Store"]);
		expect(first.status, first.stderr).toBe(0);
		const answer = JSON.parse(first.stdout);
		expect(answer.holdsParts).toBe(true);
		expect(answer.container.name).toBe("Store");
		expect(namesOf(answer.entryPoints)).toEqual(["Index"]);
		expect(namesOf(answer.hiddenParts)).toEqual(["Ledger", "Cache"]);
		expect(namesOf(answer.callers)).toEqual(["Server", "Cron"]);
		// Cron depends on the whole store, so it is a caller that reaches no entry point.
		expect(answer.callers.map((caller: { reaches: string[] }) => caller.reaches.length)).toEqual([
			1, 0,
		]);
		expect(answer.onContainer.map((edge: { fromName: string }) => edge.fromName)).toEqual(["Cron"]);
		expect(
			answer.outgoing.map((edge: { fromName: string; toName: string }) => [
				edge.fromName,
				edge.toName,
			]),
		).toEqual([["Ledger", "Disk"]]);
		expect(answer.measures).toEqual({
			entryPoints: 1,
			hiddenParts: 2,
			callers: 2,
			outgoing: 1,
			passThrough: 0,
		});

		const byId = cli(["semantic", "inspect", "shop", "--container", answer.container.id]);
		expect(byId.stdout).toBe(first.stdout);
	});

	test("a node with no children holds no parts, which is not an interface of zero entry points", () => {
		const leaf = cli(["semantic", "inspect", "shop", "--container", "Ledger"]);
		expect(leaf.status, leaf.stderr).toBe(0);
		const answer = JSON.parse(leaf.stdout);
		expect(answer.holdsParts).toBe(false);
		expect(answer.entryPoints).toBeUndefined();
		expect(answer.measures).toBeUndefined();
	});

	test("a name that fits no node or two nodes is refused with the way out; so is asking for neither or both", () => {
		const missing = cli(["semantic", "inspect", "shop", "--container", "Nowhere"]);
		expect(missing.status).toBe(2);
		expect(missing.stdout).toBe("");
		expect(missing.stderr).toContain("Nowhere");
		expect(missing.stderr).toContain("Store");

		// Two nodes that came to share a name: the name alone names neither.
		const board = JSON.parse(cli(["semantic", "show", "shop"]).stdout).board;
		const clients = board.variants[0].content.nodes.filter((node: { name: string }) =>
			node.name.startsWith("Client"),
		);
		const renamed = cli(
			[
				"semantic",
				"edit",
				"shop",
				"--expect-version",
				String(board.version),
				"--doing",
				"giving two clients one name",
			],
			JSON.stringify({
				nodes: clients.map((client: { id: string; kind: string }) => ({
					id: client.id,
					name: "Client",
					kind: client.kind,
				})),
			}),
		);
		expect(renamed.status, renamed.stderr).toBe(0);
		const ambiguous = cli(["semantic", "inspect", "shop", "--container", "Client"]);
		expect(ambiguous.status).toBe(2);
		expect(ambiguous.stdout).toBe("");
		for (const client of clients) expect(ambiguous.stderr).toContain(client.id);

		for (const args of [[], ["--group", "x", "--container", "Store"]]) {
			const neither = cli(["semantic", "inspect", "shop", ...args]);
			expect(neither.status).toBe(2);
			expect(neither.stdout).toBe("");
		}
	});
});
