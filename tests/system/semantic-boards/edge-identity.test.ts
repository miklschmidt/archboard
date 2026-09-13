import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-edge-identity-"));
let canvas: OwnedCanvas;

const cli = (args: readonly string[], input?: string) =>
	runCanvasCli({ repoRoot, vault, base: canvas.base, args, input });

beforeAll(async () => {
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
});

afterAll(async () => {
	await canvas?.dispose();
	fs.rmSync(vault, { recursive: true, force: true });
});

test("a proposal replaces an edge once two authored fields differ from its predecessor", () => {
	const created = cli(
		["semantic", "new", "edge-identity", "--doing", "stating the current request path"],
		JSON.stringify({
			nodes: [
				{ name: "Client", kind: "ui" },
				{ name: "API", kind: "service" },
				{ name: "Queue", kind: "queue" },
			],
			edges: [
				{
					from: "Client",
					to: "API",
					kind: "http",
					label: "request",
					emphasis: "hero",
				},
			],
		}),
	);
	expect(created.status, created.stderr).toBe(0);
	const initial = JSON.parse(created.stdout).board;
	const predecessor = initial.variants[0];
	const edge = predecessor.content.edges[0];
	const client = predecessor.content.nodes.find((node: { name: string }) => node.name === "Client");
	const queue = predecessor.content.nodes.find((node: { name: string }) => node.name === "Queue");

	const branched = cli([
		"semantic",
		"branch",
		"edge-identity",
		"--as",
		"Queued requests",
		"--expect-version",
		String(initial.version),
		"--doing",
		"proposing queued requests",
	]);
	expect(branched.status, branched.stderr).toBe(0);
	const branchedBoard = JSON.parse(branched.stdout).board;

	const destinationOnly = cli(
		[
			"semantic",
			"edit",
			"edge-identity",
			"--expect-version",
			String(branchedBoard.version),
			"--doing",
			"routing requests through the queue",
		],
		JSON.stringify({
			variant: "Queued requests",
			edges: [
				{
					id: edge.id,
					from: client.id,
					to: queue.id,
					kind: edge.kind,
					label: edge.label,
					emphasis: edge.emphasis,
				},
			],
		}),
	);
	expect(destinationOnly.status, destinationOnly.stderr).toBe(0);
	const afterDestination = JSON.parse(destinationOnly.stdout).board;

	const relabelled = cli(
		[
			"semantic",
			"edit",
			"edge-identity",
			"--expect-version",
			String(afterDestination.version),
			"--doing",
			"naming the queued request",
		],
		JSON.stringify({
			variant: "Queued requests",
			edges: [
				{
					id: edge.id,
					from: client.id,
					to: queue.id,
					kind: edge.kind,
					label: "enqueue",
					emphasis: edge.emphasis,
				},
			],
		}),
	);
	expect(relabelled.status).not.toBe(0);
	const problem = `${relabelled.stderr}\n${relabelled.stdout}`;
	expect(problem).toContain(edge.id);
	expect(problem).toContain("Queued requests");
	expect(problem).toContain("to");
	expect(problem).toContain("label");
	expect(problem).toContain("removeEdges");
	expect(problem).toContain("without an ID");
	expect(JSON.parse(cli(["semantic", "show", "edge-identity"]).stdout).board).toEqual(
		afterDestination,
	);

	const replaced = cli(
		[
			"semantic",
			"edit",
			"edge-identity",
			"--expect-version",
			String(afterDestination.version),
			"--doing",
			"replacing the request connection",
		],
		JSON.stringify({
			variant: "Queued requests",
			removeEdges: [edge.id],
			edges: [
				{
					from: client.id,
					to: queue.id,
					kind: edge.kind,
					label: "enqueue",
					emphasis: edge.emphasis,
				},
			],
		}),
	);
	expect(replaced.status, replaced.stderr).toBe(0);
	const resulting = JSON.parse(replaced.stdout).board;
	expect(resulting.version).toBe(afterDestination.version + 1);
	const proposal = resulting.variants.find(
		(variant: { name: string }) => variant.name === "Queued requests",
	);
	expect(proposal.content.edges).toHaveLength(1);
	expect(proposal.content.edges[0]).toMatchObject({
		from: client.id,
		to: queue.id,
		label: "enqueue",
	});
	expect(proposal.content.edges[0].id).not.toBe(edge.id);
});
