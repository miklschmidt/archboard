import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

// The public path a person and an agent use: commands create, change, read and
// draw a board across a canvas restart. Store tests own the guarantees inside.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-semantic-workflow-"));
let canvas: OwnedCanvas;

/**
 * Run one archboard command against the owned canvas.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runCanvasCli({ repoRoot, vault, base: canvas.base, args, input });

/** The architecture this feature's own pipeline has today. */
const currentPipeline = {
	level: "system",
	nodes: [
		{
			name: "Canvas server",
			kind: "service",
			responsibility: "Serves boards to panes and owns every write",
		},
		{
			name: "Board store",
			kind: "module",
			parent: "Canvas server",
			responsibility: "Takes the lease, checks the version, writes the aggregate",
		},
		{
			name: "Renderer",
			kind: "module",
			parent: "Canvas server",
			responsibility: "Turns meaning into one picture",
		},
		{ name: "Vault", kind: "datastore", responsibility: "Holds every board as a file" },
		{ name: "Pane", kind: "ui", responsibility: "Shows a board and owns the camera" },
	],
	edges: [
		{ from: "Board store", to: "Vault", kind: "data", label: "atomic write" },
		{ from: "Pane", to: "Canvas server", kind: "http", label: "render", emphasis: "hero" },
		{ from: "Renderer", to: "Board store", kind: "call" },
	],
};

beforeAll(async () => {
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
});

afterAll(async () => {
	await canvas?.dispose();
	fs.rmSync(vault, { recursive: true, force: true });
});

describe("authoring and opening a semantic board", () => {
	test("a stated architecture becomes a board, changes, and is read back", () => {
		const created = cli(
			["semantic", "new", "pipeline", "--doing", "drawing the current pipeline"],
			JSON.stringify(currentPipeline),
		);
		expect(created.stderr).toContain("version 1");
		expect(created.status).toBe(0);
		const board = JSON.parse(created.stdout).board;
		expect(board.version).toBe(1);
		expect(board.variants).toHaveLength(1);
		expect(board.variants[0].lifecycle).toBe("current");
		expect(board.variants[0].name).not.toBe("current");
		expect(board.variants[0].content.nodes).toHaveLength(5);

		const changed = cli(
			[
				"semantic",
				"edit",
				"pipeline",
				"--expect-version",
				"1",
				"--doing",
				"adding the geometry atlas",
			],
			JSON.stringify({
				nodes: [
					{
						name: "Atlas",
						kind: "module",
						parent: "Canvas server",
						responsibility: "Says where every subject landed",
					},
				],
				edges: [{ from: "Renderer", to: "Atlas", kind: "data" }],
			}),
		);
		expect(changed.status).toBe(0);
		expect(JSON.parse(changed.stdout).board.version).toBe(2);

		const read = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		expect(read.version).toBe(2);
		expect(read.variants[0].content.nodes.map((n: { name: string }) => n.name)).toContain("Atlas");
		const listed = JSON.parse(cli(["semantic"]).stdout).boards;
		expect(listed.map((entry: { name: string }) => entry.name)).toEqual(["pipeline"]);
	});

	test("an agent write that says nothing about itself is refused", () => {
		const refused = cli(
			["semantic", "edit", "pipeline", "--expect-version", "2"],
			JSON.stringify({ nodes: [] }),
		);
		expect(refused.status).not.toBe(0);
		expect(`${refused.stderr}${refused.stdout}`).toContain("what it is doing");
	});

	test("an edit that does not say which version it read is refused", () => {
		const before = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board.version;
		const refused = cli(
			["semantic", "edit", "pipeline", "--doing", "writing blind"],
			JSON.stringify({ nodes: [{ name: "Blind", kind: "module" }] }),
		);
		expect(refused.status).toBe(2);
		expect(refused.stderr).toContain("--expect-version");
		expect(JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board.version).toBe(before);
	});

	test("a stated architecture that is not one is refused rather than made into an empty board", () => {
		const refused = cli(["semantic", "new", "wrong-shape", "--doing", "getting it wrong"], "null");
		expect(refused.status).not.toBe(0);
		expect(refused.stderr).toContain("must be a JSON object");
		expect(fs.existsSync(path.join(vault, "wrong-shape.semantic.json"))).toBe(false);
	});

	test("an empty statement is an empty board, which is a board somebody meant to start", () => {
		const created = cli(
			["semantic", "new", "blank", "--doing", "starting a board"],
			JSON.stringify({ level: "system" }),
		);
		expect(created.status).toBe(0);
		expect(JSON.parse(created.stdout).board.variants[0].content.nodes).toEqual([]);
	});

	test("a write from a stale read is refused and the board does not move", () => {
		const before = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board.version;
		const refused = cli(
			["semantic", "edit", "pipeline", "--expect-version", "1", "--doing", "racing somebody"],
			JSON.stringify({ nodes: [{ name: "Latecomer", kind: "module" }] }),
		);
		expect(refused.status).toBe(5);
		expect(refused.stderr).toContain("version");
		expect(JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board.version).toBe(before);
	});

	test("the board survives a restart of the canvas", async () => {
		const before = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		// A real restart of the same canvas over the same vault. The store keeps
		// nothing between processes, so what comes back is what the file says.
		await canvas.restart();
		const reread = cli(["semantic", "show", "pipeline"]);
		expect(reread.stderr, reread.stderr).toBe("");
		expect(JSON.parse(reread.stdout).board).toEqual(before);
	}, 30_000);

	test("the board draws, and nothing about the picture came off the board", () => {
		const out = path.join(vault, "pipeline.svg");
		const drawn = cli(["semantic", "render", "pipeline", "--out", out, "--theme", "dark"]);
		expect(drawn.status).toBe(0);
		const receipt = JSON.parse(drawn.stdout);
		expect(receipt.width).toBeGreaterThan(0);
		expect(receipt.height).toBeGreaterThan(0);
		const svg = fs.readFileSync(out, "utf8");
		expect(svg.startsWith("<svg")).toBe(true);
		// Every node the board states is drawn and can be pointed at by its id.
		const stored = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		for (const node of stored.variants[0].content.nodes) {
			expect(svg).toContain(`data-semantic-id="${node.id}"`);
		}
		// The board itself carries no geometry: the picture is derived.
		const raw = fs.readFileSync(path.join(vault, "pipeline.semantic.json"), "utf8");
		expect(raw).not.toContain('"x"');
		expect(raw).not.toContain('"width"');
	});

	test("a semantic board can be claimed and released like any other board", () => {
		const claimed = cli(["claim", "--board", "pipeline", "--reason", "restructuring the pipeline"]);
		expect(claimed.stderr, claimed.stderr).not.toContain("not found");
		expect(claimed.status).toBe(0);
		const answer = JSON.parse(claimed.stdout);
		expect(answer.board).toBe("pipeline");
		expect(answer.version).toBe(
			JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board.version,
		);
		const released = cli(["release", "--board", "pipeline"]);
		expect(released.status).toBe(0);
		expect(JSON.parse(released.stdout).released).toBe(true);
	});

	test("a board whose name has a path lives in a directory and still lists", () => {
		const created = cli(
			["semantic", "new", "services/payments", "--doing", "starting the payments board"],
			JSON.stringify({ level: "system", nodes: [{ name: "Charges", kind: "module" }] }),
		);
		expect(created.stderr, created.stderr).toContain("version 1");
		expect(created.status).toBe(0);
		expect(fs.existsSync(path.join(vault, "services", "payments.semantic.json"))).toBe(true);
		const listed = JSON.parse(cli(["semantic"]).stdout).boards.map((b: { name: string }) => b.name);
		expect(listed).toContain("services/payments");
		expect(JSON.parse(cli(["semantic", "show", "services/payments"]).stdout).board.name).toBe(
			"services/payments",
		);
	});

	test("a flow drawn as a sequence is a different picture of the same board", async () => {
		// The same nodes, explained twice. Which grammar is used is the view's own
		// statement, and the board is untouched by being read either way.
		const before = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		const written = cli(
			[
				"semantic",
				"edit",
				"pipeline",
				"--expect-version",
				String(before.version),
				"--doing",
				"saying how a render goes",
			],
			JSON.stringify({
				flows: [
					{
						name: "Drawing a board",
						participants: ["Pane", "Canvas server", "Vault"],
						steps: [
							{ from: "Pane", to: "Canvas server", label: "asks for a picture", kind: "sync" },
							{ from: "Canvas server", to: "Vault", label: "reads the board", kind: "sync" },
							{ from: "Vault", to: "Canvas server", label: "the board", kind: "return" },
							{ from: "Canvas server", to: "Pane", label: "one picture", kind: "return" },
						],
					},
				],
				views: [
					{
						name: "In order",
						grammar: "data-flow",
						scope: { kind: "selection", flows: ["Drawing a board"] },
					},
				],
			}),
		);
		expect(written.stderr, written.stderr).toContain("version");
		expect(written.status).toBe(0);

		const stored = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		const flow = stored.variants[0].content.flows[0];
		const view = stored.views[0];

		const whole = await (
			await fetch(`${canvas.base}/api/semantic-boards/render?board=pipeline`)
		).json();
		const sequence = await (
			await fetch(`${canvas.base}/api/semantic-boards/render?board=pipeline&view=${view.id}`)
		).json();

		// The answer says which reading it is, and what else could be asked for.
		expect(whole.view).toBeNull();
		expect(whole.views.map((one: { id: string }) => one.id)).toEqual([view.id]);
		expect(sequence.view).toEqual({ id: view.id, name: "In order", grammar: "data-flow" });

		// The sequence draws the flow and its steps as subjects of their own; the
		// architecture does not, because it is not the picture that explains them.
		expect(sequence.svg).toContain(`data-semantic-id="${flow.id}"`);
		expect(whole.svg).not.toContain(`data-semantic-id="${flow.id}"`);
		for (const step of flow.steps) {
			expect(sequence.atlas.edges[step.id], step.label).toBeDefined();
		}
		// And it is a picture of the same board, at the same version.
		expect(sequence.version).toBe(whole.version);
	}, 30_000);

	test("a render selector that says nothing is refused rather than answered with everything", async () => {
		const asked = async (query: string): Promise<{ status: number; code: string }> => {
			const answer = await fetch(
				`${canvas.base}/api/semantic-boards/render?board=pipeline${query}`,
			);
			const body = (await answer.json()) as { code?: string };
			return { status: answer.status, code: body.code ?? "" };
		};
		// Leaving a selector out asks for the whole variant; stating an empty one
		// is a request that lost its value on the way here, and drawing the whole
		// board for it would answer a question nobody asked.
		expect(await asked("&view=")).toEqual({ status: 400, code: "BAD_REQUEST" });
		expect(await asked("&variant=%20")).toEqual({ status: 400, code: "BAD_REQUEST" });
		expect(await asked("&view=a&view=b")).toEqual({ status: 400, code: "BAD_REQUEST" });
		expect(await asked("&theme=puce")).toEqual({ status: 400, code: "BAD_REQUEST" });
		// A selector that names something this board has not got is a different
		// refusal, and says which kind of thing it could not find.
		expect(await asked("&view=nosuchview")).toEqual({ status: 404, code: "UNKNOWN_VIEW" });
	}, 20_000);

	test("a proposal is derived from what is current, and current does not move", () => {
		const before = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		const branched = cli([
			"semantic",
			"branch",
			"pipeline",
			"--as",
			"Queued ingest",
			"--expect-version",
			String(before.version),
			"--doing",
			"proposing a queue between the pane and the server",
		]);
		expect(branched.stderr, branched.stderr).toContain("version");
		expect(branched.status).toBe(0);

		const after = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		expect(after.version).toBe(before.version + 1);
		const baseline = after.variants.find((one: { id: string }) => one.id === before.current);
		const proposal = after.variants.find((one: { name: string }) => one.name === "Queued ingest");
		expect(proposal.parent).toBe(before.current);
		expect(proposal.lifecycle).toBe("draft");
		// The designation is somebody's to move, and a branch is not that somebody.
		expect(after.current).toBe(before.current);

		// Every inherited entity kept the identity it already had, which is the
		// whole mechanism behind comparing the two.
		expect(proposal.content.nodes.map((node: { id: string }) => node.id)).toEqual(
			baseline.content.nodes.map((node: { id: string }) => node.id),
		);

		// Editing the proposal leaves the baseline exactly where it was.
		const edited = cli(
			[
				"semantic",
				"edit",
				"pipeline",
				"--expect-version",
				String(after.version),
				"--doing",
				"putting the queue in the proposal",
			],
			JSON.stringify({
				variant: "Queued ingest",
				nodes: [{ name: "Ingest queue", kind: "queue" }],
			}),
		);
		expect(edited.status, edited.stderr).toBe(0);
		const now = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		const proposed = now.variants.find((one: { name: string }) => one.name === "Queued ingest");
		const untouched = now.variants.find((one: { id: string }) => one.id === now.current);
		expect(proposed.content.nodes.map((node: { name: string }) => node.name)).toContain(
			"Ingest queue",
		);
		expect(untouched.content.nodes.map((node: { name: string }) => node.name)).not.toContain(
			"Ingest queue",
		);
		// And each variant draws as itself.
		const out = path.join(vault, "proposal.svg");
		const drawn = cli([
			"semantic",
			"render",
			"pipeline",
			"--out",
			out,
			"--variant",
			"Queued ingest",
		]);
		expect(drawn.status, drawn.stderr).toBe(0);
		expect(JSON.parse(drawn.stdout).variant.name).toBe("Queued ingest");
		expect(fs.readFileSync(out, "utf8")).toContain("Ingest queue");
	}, 30_000);

	test("what a proposal changed is derived on the way out, not written on the board", async () => {
		const stored = JSON.parse(cli(["semantic", "show", "pipeline"]).stdout).board;
		const baseline = stored.variants.find((one: { id: string }) => one.id === stored.current);
		const proposal = stored.variants.find((one: { name: string }) => one.name === "Queued ingest");
		const queue = proposal.content.nodes.find(
			(node: { name: string }) => node.name === "Ingest queue",
		);

		const drawn = await (
			await fetch(`${canvas.base}/api/semantic-boards/render?board=pipeline&variant=${proposal.id}`)
		).json();
		expect(drawn.changes.predecessor.id).toBe(baseline.id);
		// The one node the proposal added is the one thing labelled as added.
		expect(drawn.changes.standing[queue.id]).toBe("added");
		for (const node of baseline.content.nodes) {
			expect(drawn.changes.standing[node.id]).toBe("unchanged");
		}

		// The variant it came from changed nothing, because it came from nothing.
		const base = await (
			await fetch(`${canvas.base}/api/semantic-boards/render?board=pipeline&variant=${baseline.id}`)
		).json();
		expect(base.changes).toBeNull();

		// And none of it is on the board: the file says what the architecture is.
		const raw = fs.readFileSync(path.join(vault, "pipeline.semantic.json"), "utf8");
		expect(raw).not.toContain("standing");
		expect(raw).not.toContain("predecessor");
		expect(raw).not.toContain("added");
	}, 20_000);

	test("a view of everything says what the whole variant says, removals and all", async () => {
		// Whole and selected views both retain the deleted subjects they select.
		const made = cli(
			["semantic", "new", "two-roots", "--doing", "starting a board with two roots"],
			JSON.stringify({
				level: "system",
				nodes: [
					{ name: "Intake", kind: "service" },
					{ name: "Reporting", kind: "service" },
				],
				views: [
					{ name: "All of it", grammar: "architecture", scope: { kind: "all" } },
					{
						name: "Reporting only",
						grammar: "architecture",
						scope: { kind: "selection", nodes: ["Reporting"] },
					},
				],
			}),
		);
		expect(made.status, made.stderr).toBe(0);

		const start = JSON.parse(made.stdout).board;
		const branched = cli([
			"semantic",
			"branch",
			"two-roots",
			"--as",
			"Without reporting",
			"--expect-version",
			String(start.version),
			"--doing",
			"proposing that reporting goes",
		]);
		expect(branched.status, branched.stderr).toBe(0);

		const branchedBoard = JSON.parse(branched.stdout).board;
		const proposal = branchedBoard.variants.find(
			(one: { name: string }) => one.name === "Without reporting",
		);
		const doomed = proposal.content.nodes.find(
			(node: { name: string }) => node.name === "Reporting",
		);
		const edited = cli(
			[
				"semantic",
				"edit",
				"two-roots",
				"--expect-version",
				String(branchedBoard.version),
				"--doing",
				"taking reporting out",
			],
			JSON.stringify({
				variant: "Without reporting",
				removeNodes: [doomed.id],
			}),
		);
		expect(edited.status, edited.stderr).toBe(0);

		const stored = JSON.parse(edited.stdout).board;
		const everything = stored.views.find((view: { name: string }) => view.name === "All of it");
		const reporting = stored.views.find((view: { name: string }) => view.name === "Reporting only");

		const endpoint = `${canvas.base}/api/semantic-boards/render?board=two-roots&variant=${proposal.id}`;
		const draw = async (view = "") => (await fetch(`${endpoint}${view}`)).json();
		const whole = await draw();
		const named = await draw(`&view=${everything.id}`);
		const selected = await draw(`&view=${reporting.id}`);

		expect(whole.changes.standing[doomed.id]).toBe("removed");
		// The same reading under another name: same subjects, same standing.
		expect(named.changes.standing[doomed.id]).toBe("removed");
		expect(named.changes.standing).toEqual(whole.changes.standing);
		// And the picture holds what it says was lost: the removed node has a box
		// in the atlas and the drawing marks it as absent rather than as part of
		// the proposal.
		expect(named.atlas.nodes[doomed.id]).toBeDefined();
		expect(named.svg).toContain('data-semantic-standing="removed"');
		// A selected deletion stays visible even when the proposal has none of it.
		expect(selected.changes.standing).toEqual({ [doomed.id]: "removed" });
		expect(selected.atlas.nodes[doomed.id]).toBeDefined();
		expect(selected.view).toEqual({
			id: reporting.id,
			name: "Reporting only",
			grammar: "architecture",
		});
		expect(selected.views).toEqual(named.views);
	}, 30_000);

	test("no Excalidraw note was created for a semantic board", () => {
		expect(fs.readdirSync(vault).filter((entry) => entry.endsWith(".excalidraw.md"))).toEqual([]);
	});
});
