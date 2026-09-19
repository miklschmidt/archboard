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
			level: "system",
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

test("one CLI edit consolidates copied proposal subjects under their inherited ids and reconnects the flow and view", () => {
	const boardName = "restore-proposal-identity";
	const created = cli(
		["semantic", "new", boardName, "--doing", "stating the inherited path"],
		JSON.stringify({
			level: "service",
			nodes: [
				{ name: "Caller", kind: "module" },
				{ name: "Worker", kind: "module", description: "Does the work" },
			],
			edges: [{ from: "Caller", to: "Worker", kind: "call", label: "work" }],
			flows: [
				{
					name: "Work",
					participants: ["Caller", "Worker"],
					steps: [{ from: "Caller", to: "Worker", label: "work" }],
				},
			],
			views: [
				{
					name: "Worker scope",
					grammar: "architecture",
					scope: { kind: "selection", nodes: ["Worker"], edges: [], flows: [] },
				},
			],
		}),
	);
	expect(created.status, created.stderr).toBe(0);
	const initial = JSON.parse(created.stdout).board;
	const original = initial.variants[0].content;
	const worker = original.nodes.find((node: { name: string }) => node.name === "Worker");
	const edge = original.edges[0];
	const flow = original.flows[0];
	const branch = cli([
		"semantic",
		"branch",
		boardName,
		"--as",
		"Proposal",
		"--expect-version",
		String(initial.version),
		"--doing",
		"proposing the path",
	]);
	expect(branch.status, branch.stderr).toBe(0);
	const edit = (version: number, input: unknown) =>
		cli(
			[
				"semantic",
				"edit",
				boardName,
				"--variant",
				"Proposal",
				"--expect-version",
				String(version),
				"--doing",
				"repairing the proposal identities",
			],
			JSON.stringify(input),
		);
	const copied = edit(JSON.parse(branch.stdout).board.version, {
		removeNodes: [worker.id],
		nodes: [{ name: worker.name, kind: worker.kind, description: worker.description }],
		edges: [{ from: edge.from, to: "Worker", kind: edge.kind, label: edge.label }],
		flows: [
			{ ...flow, participants: [edge.from, "Worker"], steps: [{ ...flow.steps[0], to: "Worker" }] },
		],
	});
	expect(copied.status, copied.stderr).toBe(0);
	const before = JSON.parse(copied.stdout).board;
	const proposal = before.variants.find((variant: { name: string }) => variant.name === "Proposal");
	const copy = proposal.content.nodes.find((node: { name: string }) => node.name === "Worker");
	expect(copy.id).not.toBe(worker.id);
	expect(proposal.content.edges[0].id).not.toBe(edge.id);
	const repaired = edit(before.version, {
		removeNodes: [copy.id],
		nodes: [worker],
		edges: [edge],
		flows: [flow],
	});
	expect(repaired.status, repaired.stderr).toBe(0);
	const answer = JSON.parse(repaired.stdout);
	const resulting = answer.board;
	const restored = resulting.variants.find(
		(variant: { name: string }) => variant.name === "Proposal",
	);
	expect(resulting.version).toBe(before.version + 1);
	expect(restored.content).toEqual(original);
	expect(resulting.views).toEqual(initial.views);
	expect(answer.warnings).toEqual([]);
	expect(resulting.variants[0]).toEqual(initial.variants[0]);
	const persisted = cli(["semantic", "show", boardName]);
	expect(persisted.status, persisted.stderr).toBe(0);
	expect(JSON.parse(persisted.stdout).board).toEqual(resulting);
});
