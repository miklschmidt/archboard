import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readRenderRecipe, type RenderRecipe } from "@archboard/renderer/recipe";
import { vaultUrl } from "../support/http.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// Every SVG `semantic render` gives out carries its render recipe (ADR 0057,
// TASK-526.02): on stdout and in a file alike, naming the board, the variant
// and the view by id, with the drawing choices and two digests. The render
// route draws a recipe again from nothing but the recipe, to the same digests. The
// fingerprint moves when what the picture draws moves. An edit of another draft, a
// walkthrough edit or a rename moves nothing that an untitled render of the current
// variant draws. The rasterize owner holds the PNG's recipe; the renderer's
// owner holds the file format.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-render-recipe-"));
const vault = vaultIn(holder);
let server: OwnedServer;

const cli = (args: readonly string[], input?: string) =>
	runServerCli({ repoRoot, server, args, input });

/** The current architecture of the board, with a view that reads part of it. */
const architecture = {
	level: "system",
	nodes: [
		{ name: "Gateway", kind: "service", responsibility: "Takes every request" },
		{ name: "Ledger", kind: "service", responsibility: "Records every transfer" },
	],
	edges: [{ from: "Gateway", to: "Ledger", kind: "call", label: "transfer" }],
	views: [
		{ name: "Front", grammar: "architecture", scope: { kind: "selection", nodes: ["Gateway"] } },
	],
};

/**
 * Run a command that must succeed.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What it printed.
 */
function ok(args: readonly string[], input?: string): ReturnType<typeof cli> {
	const run = cli(args, input);
	expect(run.status, `${args.join(" ")}: ${run.stderr}`).toBe(0);
	return run;
}

/** One variant or view, as the board names it. */
interface Named {
	readonly id: string;
	readonly name: string;
}

/**
 * Ids by name.
 * @param list Variants or views.
 * @returns Each id, by the name it goes by.
 */
function byName(list: readonly Named[]): Record<string, string> {
	return Object.fromEntries(list.map((one) => [one.name, one.id]));
}

/**
 * The board as an agent reads it.
 * @param name The board's name.
 * @returns Its id and version, its current variant, and the ids of its variants and views by name.
 */
function shown(name: string): {
	id: string;
	version: number;
	current: Named & { content: { nodes: Named[] } };
	variants: Record<string, string>;
	views: Record<string, string>;
} {
	const { board } = JSON.parse(ok(["semantic", "show", name]).stdout);
	return {
		id: board.id,
		version: board.version,
		current: board.variants.find((one: Named) => one.id === board.current),
		variants: byName(board.variants),
		views: byName(board.views),
	};
}

/**
 * Write a change to the board at its version.
 * @param name The board's name.
 * @param args What else the command takes.
 * @param input The stated change, if any.
 */
function write(name: string, args: readonly string[], input?: string): void {
	const version = String(shown(name).version);
	ok(
		[...args, "--expect-version", version, "--doing", "changing the board under its recipe"],
		input,
	);
}

/**
 * The recipe a file's bytes carry.
 * @param bytes The file.
 * @returns The recipe.
 */
function recipeOf(bytes: Uint8Array): RenderRecipe {
	const read = readRenderRecipe(bytes);
	if (read.kind !== "recipe") throw new Error(`No recipe: ${JSON.stringify(read)}`);
	return read.recipe;
}

/**
 * The render route's query that draws a recipe again, as the embeds check
 * (TASK-526.03) asks for it: the variant, the view and the variant drawn
 * against by id, and every drawing choice. The route finds a board by name,
 * so the board is the one that holds the recipe's id; here it has kept its name.
 * @param recipe The recipe.
 * @returns The query.
 */
function requestOf(recipe: RenderRecipe): URLSearchParams {
	const query = new URLSearchParams({
		board: recipe.board.name,
		theme: recipe.theme,
		fonts: "embedded",
	});
	if (recipe.variant !== "current") query.set("variant", recipe.variant.id);
	if (recipe.view !== "overview") query.set("view", recipe.view.id);
	if (recipe.comparison === "off") query.set("comparison", "off");
	else if (recipe.comparison !== "on") query.set("against", recipe.comparison.against);
	if (recipe.layout !== null) query.set("layout", recipe.layout);
	if (recipe.title === true) query.set("titled", "on");
	else if (recipe.title !== null) query.set("title", recipe.title);
	if (recipe.legend !== null) {
		query.set("legend", recipe.legend.layout);
		if (recipe.legend.alone) query.set("legendOnly", "on");
	}
	return query;
}

/**
 * The recipe of an SVG drawn to stdout.
 * @param args What `semantic render` is given.
 * @returns The recipe.
 */
function rendered(args: readonly string[]): RenderRecipe {
	return recipeOf(ok(["semantic", "render", ...args]).stdoutBytes);
}

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	ok(["semantic", "new", "ledger", "--doing", "drawing the ledger"], JSON.stringify(architecture));
	write("ledger", [
		"semantic",
		"branch",
		"ledger",
		"--as",
		"Proposal",
		"--summary",
		"Add an auditor",
	]);
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

describe("a board render's recipe", () => {
	test(
		"is in the SVG on stdout and in a file alike, byte for byte, and the same twice",
		() => {
			const board = shown("ledger");
			const out = path.join(holder, "ledger.svg");
			ok(["semantic", "render", "ledger", "--out", out]);
			const file = fs.readFileSync(out);
			const streamed = ok(["semantic", "render", "ledger"]).stdoutBytes;
			expect(streamed).toEqual(file);
			expect(ok(["semantic", "render", "ledger"]).stdoutBytes).toEqual(file);
			const recipe = recipeOf(file);
			expect(recipe).toEqual({
				recipe: 1,
				board: { id: board.id, name: "ledger" },
				// The test's vault is in no repository.
				vault: { repo: null },
				variant: "current",
				view: "overview",
				comparison: "on",
				// What an SVG render draws by default: both grounds, and the key under the picture.
				theme: "auto",
				layout: null,
				title: null,
				legend: { layout: "horizontal", alone: false },
				fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
				picture: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
			});
			// The picture digest is of the SVG without the recipe's metadata element.
			const picture = file.toString("utf8").replace(/\n<metadata>[\s\S]*?<\/metadata>/u, "");
			expect(recipe.picture).toBe(`sha256:${createHash("sha256").update(picture).digest("hex")}`);
			expect(file.toString("utf8")).toMatch(/^<svg [^>]*style="color-scheme:light dark;/u);
			expect(file.toString("utf8")).toContain('data-slot="export-legend" data-layout="horizontal"');
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"names a variant, a view and a comparison by id, and records each drawing choice",
		() => {
			const board = shown("ledger");
			const asked = rendered([
				"ledger",
				"--variant",
				"Proposal",
				"--view",
				"Front",
				"--against",
				board.current.name,
				"--theme",
				"dark",
				"--layout",
				"blocks",
				"--title",
				"The front door",
				"--legend",
				"vertical",
			]);
			expect(asked).toMatchObject({
				variant: { id: board.variants["Proposal"] },
				view: { id: board.views["Front"] },
				comparison: { against: board.current.id },
				theme: "dark",
				layout: "blocks",
				title: "The front door",
				legend: { layout: "vertical", alone: false },
			});
			const plain = rendered([
				"ledger",
				"--view",
				"Everything",
				"--no-comparison",
				"--no-legend",
				"--title",
			]);
			expect(plain).toMatchObject({
				variant: "current",
				view: { id: expect.any(String) },
				comparison: "off",
				legend: null,
				title: true,
			});
			expect(ok(["semantic", "render", "ledger", "--no-legend"]).stdout).not.toContain(
				"export-legend",
			);
			expect(rendered(["ledger", "--legend-only"]).legend).toEqual({
				layout: "horizontal",
				alone: true,
			});
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"draws the same picture again through the render route from nothing but itself",
		async () => {
			const board = shown("ledger");
			const recipes = [
				rendered(["ledger"]),
				rendered([
					"ledger",
					"--variant",
					"Proposal",
					"--view",
					"Front",
					"--against",
					board.current.name,
					"--theme",
					"light",
					"--layout",
					"blocks",
					"--title",
					"The front door",
					"--legend",
					"vertical",
				]),
				rendered(["ledger", "--view", "Everything", "--no-comparison", "--no-legend", "--title"]),
				rendered(["ledger", "--variant", "Proposal", "--legend-only"]),
			];
			for (const recipe of recipes) {
				const reply = await fetch(
					vaultUrl(server, `/api/semantic-boards/render?${requestOf(recipe)}`),
				);
				expect(reply.status).toBe(200);
				const { svg } = (await reply.json()) as { svg: string };
				// The same choices draw the same picture, so the new recipe is the old one, digests included.
				expect(recipeOf(Buffer.from(svg, "utf8"))).toEqual(recipe);
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"is in a PNG as its SVG's recipe with the scale and region, on stdout as in a file",
		() => {
			const out = path.join(holder, "ledger.png");
			const receipt = JSON.parse(
				ok(["semantic", "rasterize", "ledger", "--scale", "2", "--out", out]).stdout,
			);
			// A bitmap cannot follow the reader's colour scheme, so it is drawn dark.
			expect(receipt.theme).toBe("dark");
			const png = fs.readFileSync(out);
			const svg = ok(["semantic", "render", "ledger", "--theme", "dark"]).stdoutBytes;
			expect(recipeOf(png)).toEqual({ ...recipeOf(svg), raster: { scale: 2, region: null } });
			expect(ok(["semantic", "rasterize", "ledger", "--scale", "2"]).stdoutBytes).toEqual(png);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"keeps its fingerprint through an edit of another draft, a walkthrough edit and a rename of an untitled render, and not through an edit of what it draws",
		() => {
			const before = rendered(["ledger"]);
			const draft = rendered(["ledger", "--variant", "Proposal"]).fingerprint;
			write(
				"ledger",
				["semantic", "edit", "ledger", "--variant", "Proposal"],
				JSON.stringify({ nodes: [{ name: "Auditor", kind: "service" }] }),
			);
			expect(rendered(["ledger", "--variant", "Proposal"]).fingerprint).not.toBe(draft);
			write(
				"ledger",
				["semantic", "edit", "ledger"],
				JSON.stringify({
					walkthroughs: [{ name: "A transfer", beats: [{ heading: "In", body: "It lands." }] }],
				}),
			);
			write("ledger", ["semantic", "rename", "ledger", "--to", "books"]);
			const { current } = shown("books");
			write("books", ["semantic", "rename", "books", "--variant", current.id, "--to", "As built"]);
			const after = rendered(["books"]);
			expect(after.fingerprint).toBe(before.fingerprint);
			expect(after.board).toEqual({ id: before.board.id, name: "books" });
			const drawnDraft = rendered(["books", "--variant", "Proposal"]).fingerprint;
			const ledger = current.content.nodes.find((node) => node.name === "Ledger");
			write(
				"books",
				["semantic", "edit", "books"],
				JSON.stringify({
					nodes: [{ ...ledger, responsibility: "Keeps the books" }],
				}),
			);
			expect(rendered(["books"]).fingerprint).not.toBe(before.fingerprint);
			// A proposal is drawn as the comparison with the current variant, so it moves too.
			expect(rendered(["books", "--variant", "Proposal"]).fingerprint).not.toBe(drawnDraft);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});
