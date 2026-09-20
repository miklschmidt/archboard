import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createJsonRequester } from "../support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import {
	BANNER,
	DRILL_OPEN,
	SURFACE,
	WAIT,
	drawnId,
	pick,
	press,
	shownBoard,
	stageState,
	textOf,
} from "./support/drilling.ts";
import { serverPath, type PanesBody } from "./support/navigator-support.ts";

// Which board a pane is on, once somebody has followed a link down.
//
// A drill-down opens another board in the same pane, and nobody addressed it.
// Everything that is about "the board this pane holds" has to follow it there:
// the inventory an agent reads before it does anything, the claim the pane
// says is on its board, the code a picked node opens, the address, and the
// file the canvas watches for somebody else's writes. A pane that reports one
// board and draws another sends an agent to the wrong architecture — it reads
// the parent while the person is discussing the child — and every part of that
// failure is invisible from inside any one of those owners, which is why this
// one crosses all of them in a real browser.

/** The repository both boards bind their code into. */
const REPOSITORY = "github.com/acme/drill";

/**
 * A checkout the two boards can bind code into, registered so the canvas can
 * find it on this machine (ADR 0004, ADR 0011).
 * @param root Where to build it.
 * @returns The checkout root and the registry file naming it.
 */
function aCheckout(root: string): { checkout: string; registry: string } {
	const checkout = join(root, "checkout");
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(join(checkout, "src", "pipeline.ts"), "export {};\n");
	writeFileSync(join(checkout, "src", "engine.ts"), "export {};\n");
	for (const argv of [
		["init", "-q"],
		["remote", "add", "origin", `https://${REPOSITORY}.git`],
	]) {
		const ran = Bun.spawnSync(["git", ...argv], { cwd: checkout, stderr: "pipe" });
		if (ran.exitCode !== 0) {
			throw new Error(`git ${argv[0]}: ${ran.stderr.toString()}`);
		}
	}
	const registry = join(root, "repos.json");
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: REPOSITORY, root: checkout, source: "declared", addedAt: "2026-01-01" },
		]),
	);
	return { checkout, registry };
}

/**
 * An opener that records what it was asked to open instead of opening it.
 *
 * The whole point of the assertion is the path the canvas resolved, and that
 * is the one thing a real editor would swallow.
 * @param root Where to put the script and its log.
 * @returns The opener config file and the log it appends to.
 */
function aRecordingOpener(root: string): { config: string; log: string } {
	const log = join(root, "opened.log");
	const script = join(root, "record-open.sh");
	writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`);
	chmodSync(script, 0o755);
	const config = join(root, "opener.json");
	writeFileSync(
		config,
		JSON.stringify({ version: 1, kind: "custom", executable: script, argv: ["{path}"] }),
	);
	return { config, log };
}

/**
 * What the recording opener has been asked to open, oldest first.
 * @param log The log file.
 * @returns The paths.
 */
function opened(log: string): string[] {
	try {
		return readFileSync(log, "utf8").split("\n").filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * Replace a board file the way an atomic write does: a new inode in place of
 * the old one, with nothing in this canvas involved.
 * @param file The board file.
 * @param change What to do to the document before it is written back.
 */
function replaceBoard(file: string, change: (board: Record<string, unknown>) => void): void {
	const board = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
	change(board);
	const incoming = `${file}.incoming`;
	writeFileSync(incoming, `${JSON.stringify(board, null, "\t")}\n`);
	renameSync(incoming, file);
}

test("a board followed down becomes the board the pane holds, everywhere", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const root = join(ownerRoot, "drill-boundary");
	const vault = join(root, "vault");
	mkdirSync(vault, { recursive: true });
	const { registry } = aCheckout(root);
	const opener = aRecordingOpener(root);
	const canvas = await startOwnedCanvas({
		serverPath,
		vault,
		env: canvasTestEnvironment({
			ARCHBOARD_REPOS: registry,
			ARCHBOARD_OPENER_CONFIG: opener.config,
		}),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	// The board one level down, and the one a reader starts on. Each binds a
	// different file, so what the opener is handed says which board answered.
	const below = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the engine",
		body: {
			board: "engine",
			origin: "agent",
			create: {
				level: "module",
				variant: "as built",
				nodes: [
					{
						name: "atomic-write",
						kind: "module",
						binding: { repo: REPOSITORY, path: "src/engine.ts" },
					},
				],
				edges: [],
			},
		},
	});
	expect(below.status).toBe(200);
	// And a proposal on it, which is what the link points at: a link down names
	// a reading of the board below, and naming a draft is the case where the
	// pane's address has to carry a variant as well as a board.
	const branched = await request<{ board: { variants: Array<{ id: string; name: string }> } }>(
		"/api/semantic-boards/branch?expectVersion=1",
		{
			method: "POST",
			doing: "proposing the write path",
			body: { board: "engine", branch: { from: "current", name: "as proposed" } },
		},
	);
	expect(branched.status).toBe(200);
	const proposal = branched.body.board.variants.find((one) => one.name === "as proposed");
	expect(proposal?.id).toBeString();
	const above = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing the pipeline",
		body: {
			board: "pipeline",
			origin: "agent",
			create: {
				level: "system",
				nodes: [
					{
						name: "board-io",
						kind: "module",
						binding: { repo: REPOSITORY, path: "src/pipeline.ts" },
						drillDown: { board: "engine", variant: { kind: "named", name: "as proposed" } },
					},
				],
				edges: [],
			},
		},
	});
	expect(above.status).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=pipeline`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser),
		(state) => state === "drawn",
		"the board the pane was opened on to be drawn",
		WAIT,
	);
	await pollUntil(
		async () => (await request<PanesBody>("/api/panes")).body.panes[0]?.board ?? null,
		(board) => board === "pipeline",
		"the inventory to say the pane is on the board it was opened on",
		WAIT,
	);

	// Down a level, the way a person goes: pick the node, press the link.
	const link = await drawnId(browser, "board-io");
	await pick(browser, link ?? "");
	await pollUntil(
		() => textOf(browser, "[data-slot='semantic-drill-down']"),
		(said) => said.includes("as proposed"),
		"the link to name where it goes before anybody follows it",
		WAIT,
	);
	await press(browser, DRILL_OPEN);
	await pollUntil(
		() => shownBoard(browser),
		(board) => board === "engine",
		"the pane to draw the board a level down",
		WAIT,
	);

	// The inventory is the first thing an agent reads, and it is the whole of
	// what it knows about where the person is looking.
	const inventory = await pollUntil(
		async () => (await request<PanesBody>("/api/panes")).body,
		(body) =>
			body.panes[0]?.board === `engine@${proposal?.id ?? ""}` &&
			body.panes[0]?.reading.variant?.name === "as proposed",
		"the inventory to say the pane holds the board it followed into, and how it is reading it",
		WAIT,
	);
	const held = inventory.panes[0];
	// The board and the reading of it are two facts, and the report keeps them
	// apart: the file, the lease and the claim are the board's; only what is
	// drawn is the variant's.
	expect(held?.identity).toEqual({ board: "engine", variant: proposal?.id ?? "" });
	// Named by its own lasting name, so an agent told "as proposed" can write
	// against it without resolving an id it was never given.
	expect(held?.reading.variant?.name).toBe("as proposed");
	expect(inventory.text).toContain("engine");
	// The address says the same, because there is only one answer to give.
	await pollUntil(
		() => browser.eval<string>("window.location.search"),
		(search) => search === `?paneA=engine@${proposal?.id ?? ""}`,
		"the address to name the board and the reading on screen",
		WAIT,
	);

	// A claim on the board the reader LEFT says nothing here: the pane is not
	// on it any more, and a banner about it would be about somebody else's
	// screen.
	expect(
		(
			await request<{ success: boolean }>("/api/semantic-boards/claim?board=pipeline", {
				method: "POST",
				body: { reason: "reworking the level above" },
			})
		).status,
	).toBe(200);
	expect(await textOf(browser, BANNER)).toBe("");

	// A claim on the board it is on does, and it is claimed by NAME while the
	// pane is on a variant of it: one writer at a time is a fact about the
	// document, not about the reading somebody has open (ADR 0016).
	expect(
		(
			await request<{ success: boolean }>("/api/semantic-boards/claim?board=engine", {
				method: "POST",
				body: { reason: "rewriting the write path" },
			})
		).status,
	).toBe(200);
	const banner = await pollUntil(
		() => textOf(browser, BANNER),
		(said) => said.includes("rewriting the write path"),
		"the pane to say who has the board it followed into",
		WAIT,
	);
	expect(banner).toContain("Agent claimed this board");

	// The code a picked node opens is resolved on the board that is on screen.
	// Resolved against the level above, this id is not a node at all.
	const node = await drawnId(browser, "atomic-write");
	await pick(browser, node ?? "");
	await pollUntil(
		() => textOf(browser, "[data-slot='semantic-inspector']"),
		(said) => said.includes("atomic-write"),
		"the inspector to explain the node picked a level down",
		WAIT,
	);
	await press(browser, "[data-slot='semantic-inspector-open-code']");
	const paths = await pollUntil(
		() => opened(opener.log),
		(files) => files.length > 0,
		"the editor to be asked for the picked node's file",
		WAIT,
	);
	expect(paths).toHaveLength(1);
	expect(paths[0]?.endsWith("src/engine.ts")).toBeTrue();

	// And the file the canvas watches is the one on screen: another writer
	// replaces it, and the picture the reader is looking at follows (ADR 0015,
	// ADR 0016). Watching the board the pane was opened on would leave this
	// reader on a version nobody has for as long as they stayed here.
	replaceBoard(join(vault, "engine.semantic.json"), (board) => {
		const document = board as {
			version: number;
			variants: Array<{ id: string; content: { nodes: Array<Record<string, unknown>> } }>;
		};
		document.version += 1;
		const drafted = document.variants.find((one) => one.id === proposal?.id);
		drafted?.content.nodes.push({
			id: "Ld93kQ2p",
			name: "board-version",
			kind: "module",
			order: 1,
		});
	});
	await pollUntil(
		() => textOf(browser, SURFACE),
		(drawn) => drawn.includes("board-version"),
		"somebody else's write to the board on screen to reach the reader",
		WAIT,
	);

	await canvas.assertRunning();
}, 90_000);
