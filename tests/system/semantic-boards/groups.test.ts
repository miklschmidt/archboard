import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

// The public path to a group: configure it, put parts of two containers in it,
// and ask the command line what it is. The pure inspection owns the semantics;
// this owner is for the claim that a command with no browser answers them.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-semantic-groups-"));
let canvas: OwnedCanvas;

/**
 * Run one archboard command against the owned canvas.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runCanvasCli({ repoRoot, vault, base: canvas.base, args, input });

/** Fulfillment across Orders and Shipping; the worker is also Billing's. */
const ARCHITECTURE = {
	level: "system",
	nodes: [
		{ name: "Orders", kind: "service" },
		{ name: "Shipping", kind: "service" },
		{ name: "Handler", kind: "route", parent: "Orders", groups: ["fulfillment"] },
		{ name: "Queue", kind: "queue", parent: "Orders", groups: ["fulfillment"] },
		{ name: "Worker", kind: "job", parent: "Shipping", groups: ["billing", "fulfillment"] },
		{ name: "Ledger", kind: "datastore", groups: ["billing"] },
		{ name: "Gateway", kind: "route" },
	],
	edges: [
		{ from: "Gateway", to: "Handler", kind: "http", label: "place order" },
		{ from: "Handler", to: "Queue", kind: "queue" },
		{ from: "Queue", to: "Worker", kind: "queue" },
		{ from: "Worker", to: "Ledger", kind: "data" },
	],
};

beforeAll(async () => {
	fs.mkdirSync(path.join(vault, ".archboard"), { recursive: true });
	fs.writeFileSync(
		path.join(vault, ".archboard/config.yaml"),
		Bun.YAML.stringify({
			...DEFAULT_SEMANTIC_POLICY,
			groups: {
				fulfillment: { name: "Fulfillment" },
				billing: { name: "Billing" },
				platform: { name: "Platform" },
			},
		}),
	);
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
});

afterAll(async () => {
	await canvas?.dispose();
	fs.rmSync(vault, { recursive: true, force: true });
});

describe("inspecting a configured group from the command line", () => {
	test("members, internal and directed boundary relationships and neighbours come back deterministically", () => {
		const created = cli(
			["semantic", "new", "orders", "--doing", "drawing fulfillment"],
			JSON.stringify(ARCHITECTURE),
		);
		expect(created.status).toBe(0);

		const first = cli(["semantic", "inspect", "orders", "--group", "fulfillment"]);
		expect(first.status).toBe(0);
		const answer = JSON.parse(first.stdout);
		expect(answer.group).toEqual({ id: "fulfillment", name: "Fulfillment", configured: true });
		expect(answer.members.map((node: { name: string }) => node.name)).toEqual([
			"Handler",
			"Queue",
			"Worker",
		]);
		// Two containers, neither of them a member.
		expect(new Set(answer.members.map((node: { parent: string }) => node.parent)).size).toBe(2);
		expect(answer.internalEdges).toHaveLength(2);
		expect(
			answer.boundaryEdges.map((edge: { direction: string; label: string | null }) => [
				edge.direction,
				edge.label,
			]),
		).toEqual([
			["incoming", "place order"],
			["outgoing", null],
		]);
		expect(answer.neighbors.map((node: { name: string }) => node.name)).toEqual([
			"Ledger",
			"Gateway",
		]);
		const worker = answer.members.find((node: { name: string }) => node.name === "Worker");
		expect(worker.groups).toEqual(["billing", "fulfillment"]);

		// Asked again, the same bytes: nothing about the answer depends on when.
		const second = cli(["semantic", "inspect", "orders", "--group", "fulfillment"]);
		expect(second.stdout).toBe(first.stdout);
	});

	test("a configured group nobody has joined answers empty; an id that is nothing is refused", () => {
		const empty = cli(["semantic", "inspect", "orders", "--group", "platform"]);
		expect(empty.status).toBe(0);
		const answer = JSON.parse(empty.stdout);
		expect(answer.group.configured).toBe(true);
		expect(answer.members).toEqual([]);
		expect(answer.neighbors).toEqual([]);

		const refused = cli(["semantic", "inspect", "orders", "--group", "nowhere"]);
		expect(refused.status).toBe(2);
		expect(refused.stdout).toBe("");
		expect(refused.stderr).toContain("nowhere");
		expect(refused.stderr).toContain("fulfillment");
	});

	test("a group the configuration dropped stays inspectable by id, with a warning", () => {
		fs.writeFileSync(
			path.join(vault, ".archboard/config.yaml"),
			Bun.YAML.stringify({
				...DEFAULT_SEMANTIC_POLICY,
				groups: { fulfillment: { name: "Fulfillment" } },
			}),
		);
		const retired = cli(["semantic", "inspect", "orders", "--group", "billing"]);
		expect(retired.status).toBe(0);
		const answer = JSON.parse(retired.stdout);
		expect(answer.group).toEqual({ id: "billing", name: null, configured: false });
		expect(answer.members.map((node: { name: string }) => node.name)).toEqual(["Worker", "Ledger"]);
		expect(
			answer.warnings.some(
				(warning: { code: string; path?: string }) =>
					warning.code === "UNKNOWN_VOCABULARY" && warning.path?.includes("billing"),
			),
		).toBe(true);
	});

	test("a newly authored unknown group is refused while the configuration is valid", () => {
		const board = JSON.parse(cli(["semantic", "show", "orders"]).stdout).board;
		const refused = cli(
			[
				"semantic",
				"edit",
				"orders",
				"--expect-version",
				String(board.version),
				"--doing",
				"joining a group nobody configured",
			],
			JSON.stringify({ nodes: [{ name: "Gateway", kind: "route", groups: ["nowhere"] }] }),
		);
		expect(refused.status).not.toBe(0);
		expect(`${refused.stderr}${refused.stdout}`).toContain("nowhere");
		expect(JSON.parse(cli(["semantic", "show", "orders"]).stdout).board.version).toBe(
			board.version,
		);
	});
});
