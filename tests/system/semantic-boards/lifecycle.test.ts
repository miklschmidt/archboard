import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

// The whole path a person and an agent actually use: a command makes a board,
// a command changes it, a command reads it back, the canvas is restarted, and
// the picture is drawn — all through the public surface, with nothing reaching
// into the store. What this owner is for is the claim that those five things
// join up; the store's own contract tests own the guarantees inside them.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-semantic-lifecycle-"));
let canvas: OwnedCanvas;

/**
 * Run one archboard command against the owned canvas.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runCanvasCli({ repoRoot, vault, base: canvas.base, args, input });

beforeAll(async () => {
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
});

afterAll(async () => {
	await canvas?.dispose();
	fs.rmSync(vault, { recursive: true, force: true });
});

describe("settling a proposal and adopting an architecture", () => {
	test("a disagreement is settled through the command line, and the answer says what it left", () => {
		// Its own board: a baseline, a draft off it, and the two of them deciding
		// different things about one name.
		expect(
			cli(
				["semantic", "new", "settling", "--doing", "starting a board to settle"],
				JSON.stringify({ nodes: [{ name: "API", kind: "service" }] }),
			).status,
		).toBe(0);
		const start = JSON.parse(cli(["semantic", "show", "settling"]).stdout).board;
		const api = start.variants[0].content.nodes[0].id;
		expect(
			cli([
				"semantic",
				"branch",
				"settling",
				"--as",
				"Gateway first",
				"--expect-version",
				String(start.version),
				"--doing",
				"proposing a gateway",
			]).status,
		).toBe(0);

		/**
		 * Rename the API node on one variant.
		 * @param variant The variant.
		 * @param name What to call it.
		 * @returns What the command printed and how it exited.
		 */
		const rename = (variant: string, name: string) =>
			cli(
				[
					"semantic",
					"edit",
					"settling",
					"--expect-version",
					String(JSON.parse(cli(["semantic", "show", "settling"]).stdout).board.version),
					"--doing",
					`renaming the API on ${variant}`,
				],
				JSON.stringify({ variant, nodes: [{ id: api, name, kind: "service" }] }),
			);
		expect(rename("Gateway first", "Gateway").status).toBe(0);
		const parentEdit = rename(start.variants[0].name, "Public API");
		expect(parentEdit.status, parentEdit.stderr).toBe(0);

		// The edit's own answer says what it left for somebody, in the words the
		// reconciliation wrote rather than a second account of the same thing.
		expect(parentEdit.stderr).toContain("Gateway first");
		expect(parentEdit.stderr).toContain("disagreement");
		expect(parentEdit.stderr).toContain("Say which one this proposal means");

		const held = JSON.parse(cli(["semantic", "show", "settling"]).stdout).board;
		const draft = held.variants.find((one: { name: string }) => one.name === "Gateway first");
		expect(draft.reconciliation.issues).toHaveLength(1);
		expect(draft.content.nodes[0].name).toBe("Gateway");

		const settled = cli(
			[
				"semantic",
				"resolve",
				"settling",
				"--variant",
				"Gateway first",
				"--expect-version",
				String(held.version),
				"--doing",
				"keeping the gateway name",
			],
			JSON.stringify({ choices: [{ subject: api, field: "name", side: "mine" }] }),
		);
		expect(settled.status, settled.stderr).toBe(0);
		const after = JSON.parse(cli(["semantic", "show", "settling"]).stdout).board;
		const now = after.variants.find((one: { name: string }) => one.name === "Gateway first");
		expect(now.reconciliation).toBeUndefined();
		expect(now.content.nodes[0].name).toBe("Gateway");
	}, 60_000);

	test("the command's own answer carries the version and what it left, not only prose", () => {
		// An agent reads the JSON; a person reads the prose. Both come from the
		// same answer, so an agent never has to parse a sentence to learn that two
		// proposals now need somebody.
		const held = JSON.parse(cli(["semantic", "show", "settling"]).stdout).board;
		const written = cli(
			[
				"semantic",
				"edit",
				"settling",
				"--expect-version",
				String(held.version),
				"--doing",
				"adding something every draft can take",
			],
			JSON.stringify({ nodes: [{ name: "Ledger", kind: "service" }] }),
		);
		expect(written.status, written.stderr).toBe(0);
		const answer = JSON.parse(written.stdout);
		expect(answer.version).toBe(held.version + 1);
		expect(answer.board.version).toBe(answer.version);
		// Every draft the change reached, including the ones that simply took it.
		expect(answer.reconciliation.required).toBe(false);
		expect(answer.reconciliation.drafts.map((one: { name: string }) => one.name)).toContain(
			"Gateway first",
		);
		expect(
			answer.reconciliation.drafts.every((one: { outcome: string }) => one.outcome === "merged"),
		).toBe(true);
	}, 60_000);

	test("adopting moves the designation and records why, through the command line", () => {
		const held = JSON.parse(cli(["semantic", "show", "settling"]).stdout).board;
		const was = held.current;
		const adopted = cli([
			"semantic",
			"adopt",
			"settling",
			"--variant",
			"Gateway first",
			"--reason",
			"the gateway shipped",
			"--expect-version",
			String(held.version),
			"--doing",
			"adopting the gateway",
		]);
		expect(adopted.status, adopted.stderr).toBe(0);
		expect(adopted.stderr).toContain("Gateway first");

		const after = JSON.parse(cli(["semantic", "show", "settling"]).stdout).board;
		const now = after.variants.find((one: { id: string }) => one.id === after.current);
		expect(now.name).toBe("Gateway first");
		expect(now.lifecycle).toBe("current");
		expect(after.variants.find((one: { id: string }) => one.id === was).lifecycle).toBe(
			"historical",
		);
		expect(after.adoptions).toHaveLength(1);
		expect(after.adoptions[0].reason).toBe("the gateway shipped");

		// What was implemented then is a record: it refuses an ordinary edit.
		const refused = cli(
			[
				"semantic",
				"edit",
				"settling",
				"--expect-version",
				String(after.version),
				"--doing",
				"trying to rewrite what was implemented",
			],
			JSON.stringify({
				variant: after.variants.find((one: { id: string }) => one.id === was).name,
				nodes: [{ name: "Afterthought", kind: "service" }],
			}),
		);
		expect(refused.status).not.toBe(0);
		expect(refused.stderr).toContain("was implemented");
	}, 60_000);

	test("a write that blocks a draft still answers, and says whose decision it waits for", async () => {
		// A chain: a baseline, a draft off it, and a draft off that one. The middle
		// draft decides something of its own, the baseline decides otherwise, and
		// the one underneath is left where it was.
		expect(
			cli(
				["semantic", "new", "blocking", "--doing", "starting a chain"],
				JSON.stringify({ nodes: [{ name: "API", kind: "service" }] }),
			).status,
		).toBe(0);
		const start = JSON.parse(cli(["semantic", "show", "blocking"]).stdout).board;
		const api = start.variants[0].content.nodes[0].id;
		/**
		 * Derive a proposal from another state of this board.
		 * @param from The state to derive from.
		 * @param name What to call it.
		 * @returns What the command printed and how it exited.
		 */
		const branch = (from: string, name: string) =>
			cli([
				"semantic",
				"branch",
				"blocking",
				"--as",
				name,
				"--from",
				from,
				"--expect-version",
				String(JSON.parse(cli(["semantic", "show", "blocking"]).stdout).board.version),
				"--doing",
				`proposing ${name}`,
			]);
		expect(branch(start.variants[0].name, "Queued").status).toBe(0);
		expect(branch("Queued", "Queued and batched").status).toBe(0);

		/**
		 * Rename the API node on one variant.
		 * @param variant The variant.
		 * @param name What to call it.
		 * @returns What the command printed and how it exited.
		 */
		const rename = (variant: string, name: string) =>
			cli(
				[
					"semantic",
					"edit",
					"blocking",
					"--expect-version",
					String(JSON.parse(cli(["semantic", "show", "blocking"]).stdout).board.version),
					"--doing",
					`renaming the API on ${variant}`,
				],
				JSON.stringify({ variant, nodes: [{ id: api, name, kind: "service" }] }),
			);
		expect(rename("Queued", "Gateway").status).toBe(0);
		const parentEdit = rename(start.variants[0].name, "Public API");

		// The command has to be able to read its own answer: a write that blocks
		// something is exactly the write whose answer somebody needs.
		expect(parentEdit.status, parentEdit.stderr).toBe(0);
		expect(parentEdit.stderr).toContain('"Queued and batched" was not brought forward');
		expect(parentEdit.stderr).toContain('"Queued" is itself unsettled');

		// And the board says the same: the blocked draft kept what it had.
		const after = JSON.parse(cli(["semantic", "show", "blocking"]).stdout).board;
		const blocked = after.variants.find(
			(one: { name: string }) => one.name === "Queued and batched",
		);
		const queued = after.variants.find((one: { name: string }) => one.name === "Queued");
		expect(blocked.content.nodes[0].name).toBe("Gateway");
		expect(blocked.reconciliation.blockedBy).toBe(queued.id);

		// And it can still be drawn. The render answer says what the state is
		// waiting on without the state it was measured from — a whole second copy
		// of the architecture, which is the store's own business — and the reader
		// refuses an answer carrying anything else.
		const drawn = cli([
			"semantic",
			"render",
			"blocking",
			"--variant",
			"Queued and batched",
			"--out",
			path.join(vault, "blocked.svg"),
		]);
		expect(drawn.status, drawn.stderr).toBe(0);

		// What the picture was answered with, read off the route the viewer reads:
		// which state has to decide, and nothing the store keeps for itself.
		const answered = await fetch(
			`${canvas.base}/api/semantic-boards/render?board=blocking&variant=${encodeURIComponent(
				"Queued and batched",
			)}`,
		);
		expect(answered.status).toBe(200);
		expect(((await answered.json()) as { waiting: unknown }).waiting).toEqual({
			against: queued.id,
			atVersion: blocked.reconciliation.atVersion,
			issues: [],
			blockedBy: queued.id,
		});
	}, 60_000);

	test("a write addressed the way a pane is addressed is refused as a bad board name", async () => {
		expect(
			cli(
				["semantic", "new", "addressing", "--doing", "starting a board to address"],
				JSON.stringify({ nodes: [{ name: "API", kind: "service" }] }),
			).status,
		).toBe(0);
		const start = JSON.parse(cli(["semantic", "show", "addressing"]).stdout).board;
		// A pane names a board and which of its variants it is showing. A write
		// names the board alone — every variant lives in the one document — so this
		// is a caller spelling a write the way it spells what it is looking at.
		const answer = await fetch(
			`${canvas.base}/api/semantic-boards/edit?expectVersion=${start.version}`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					board: `addressing@${start.variants[0].id}`,
					reason: "trying to edit a variant by address",
					edit: { nodes: [{ name: "Nowhere", kind: "service" }] },
				}),
			},
		);
		const body = (await answer.json()) as { code?: string; error?: string };
		expect(answer.status).toBe(400);
		expect(body.code).toBe("BAD_BOARD_NAME");
		expect(body.error).toContain("the variant it is about is stated inside the command");

		// And nothing was written: the board is where it was.
		expect(JSON.parse(cli(["semantic", "show", "addressing"]).stdout).board.version).toBe(
			start.version,
		);
	}, 60_000);

	test("the news of a write says who wrote it and what it was held under", async () => {
		expect(
			cli(
				["semantic", "new", "attributed", "--doing", "starting a board to attribute"],
				JSON.stringify({ nodes: [{ name: "API", kind: "service" }] }),
			).status,
		).toBe(0);
		const endpoint = new URL(canvas.base);
		endpoint.protocol = "ws:";
		endpoint.searchParams.set("clientId", "listening-pane");
		const socket = new WebSocket(endpoint);
		const heard: Record<string, unknown>[] = [];
		socket.addEventListener("message", (event: { data: unknown }) => {
			heard.push(JSON.parse(String(event.data)) as Record<string, unknown>);
		});
		await new Promise<void>((resolve, reject) => {
			socket.addEventListener("open", () => resolve(), { once: true });
			socket.addEventListener("error", () => reject(new Error("no socket")), { once: true });
		});

		/**
		 * Change the board through the route, saying what the write is for.
		 * @param stated What the envelope says beyond the board.
		 * @returns The board_note the write announced.
		 */
		const wrote = async (stated: Record<string, unknown>): Promise<Record<string, unknown>> => {
			const at = JSON.parse(cli(["semantic", "show", "attributed"]).stdout).board.version;
			const before = heard.length;
			const answer = await fetch(
				`${canvas.base}/api/semantic-boards/edit?expectVersion=${at}&doing=${encodeURIComponent("attributing a write")}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						board: "attributed",
						edit: { nodes: [{ name: `Node ${at}`, kind: "service" }] },
						...stated,
					}),
				},
			);
			expect(answer.status).toBe(200);
			for (let waited = 0; waited < 50 && heard.length === before; waited += 1) {
				await Bun.sleep(20);
			}
			const note = heard
				.slice(before)
				.find((message) => message["type"] === "board_note" && message["semantic"] === true);
			if (note === undefined) throw new Error("the write announced nothing");
			return note;
		};

		// A write that says which pane it is for is attributable: a thread reading
		// this can tell somebody else's news from its own echo.
		const mine = await wrote({ paneId: "listening-pane", reason: "a pane's own write" });
		expect(mine["by"]).toBe("listening-pane");
		expect(typeof mine["heldAs"]).toBe("string");

		// A write that names no pane is unattributable, and says so rather than
		// borrowing the identity the board happened to be held under.
		const anonymous = await wrote({ reason: "an agent with no pane" });
		expect(anonymous["by"]).toBeNull();
		expect(anonymous["heldAs"]).not.toBe(mine["heldAs"]);

		// And the command line says it too, when it is running for a pane. A
		// workhorse bound to one states it from its session's environment rather
		// than being asked to type it on every write.
		const before = heard.length;
		const bound = runCanvasCli({
			repoRoot,
			vault,
			base: canvas.base,
			args: [
				"semantic",
				"edit",
				"attributed",
				"--expect-version",
				String(JSON.parse(cli(["semantic", "show", "attributed"]).stdout).board.version),
				"--doing",
				"writing as the pane's workhorse",
			],
			input: JSON.stringify({ nodes: [{ name: "Bound", kind: "service" }] }),
			env: { ARCHBOARD_PANE: "listening-pane" },
		});
		expect(bound.status, bound.stderr).toBe(0);
		for (let waited = 0; waited < 50 && heard.length === before; waited += 1) {
			await Bun.sleep(20);
		}
		expect(
			heard
				.slice(before)
				.find((message) => message["type"] === "board_note" && message["semantic"] === true)?.[
				"by"
			],
		).toBe("listening-pane");
		socket.close();
	}, 60_000);
});
