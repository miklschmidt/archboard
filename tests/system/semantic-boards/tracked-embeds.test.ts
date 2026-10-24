import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readRenderRecipe, type RenderRecipe } from "@archboard/renderer/recipe";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// Tracked embeds over a real server and four Git repositories (ADR 0057,
// TASK-526.04): the models repository holds the vault, the docs repository
// keeps the pictures and is registered, the wiki repository keeps one and is
// not, and the platform repository is where the board moves. `--track` lists
// a file on the board through a board write; after a board edit the vault's
// check reports the docs picture as information and the docs check as a
// warning; `--fix` on the vault side draws it in the docs checkout and names
// the wiki picture it cannot reach; after a move the platform vault's check
// names the recipe that still names the models repository, and `--fix`
// writes the recipe again.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-tracked-")));
const at = (name: string) => path.join(root, name);
const [models, docs, wiki, platform, loose, outside] = [
	"models",
	"docs",
	"wiki",
	"platform",
	"loose",
	"outside",
].map(at) as [string, string, string, string, string, string];
const MODELS = "github.com/example/models";
const DOCS = "github.com/example/docs";
const WIKI = "github.com/example/wiki";
const PLATFORM = "github.com/example/platform";
let server: OwnedServer;

/** A Git command in a repository, committing as a test author. */
function git(repository: string, ...args: string[]): string {
	const run = spawnSync(
		"git",
		["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
		{ cwd: repository, encoding: "utf8" },
	);
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
	return run.stdout.trim();
}

/** A command in a directory, against the server, that must exit as expected. */
function cli(
	directory: string,
	args: readonly string[],
	options: { input?: string; status?: number } = {},
) {
	const run = runServerCli({
		repoRoot,
		server,
		vault: path.join(directory, ".archboard", "vault"),
		args,
		input: options.input,
	});
	expect(run.status, `${args.join(" ")}: ${run.stderr}`).toBe(options.status ?? 0);
	return run;
}

/** A board as `semantic show` reads it in a repository. */
function shown(repository: string, board: string) {
	return JSON.parse(cli(repository, ["semantic", "show", board]).stdout).board as {
		version: number;
		current: string;
		trackedEmbeds?: { repo: string; path: string }[];
		variants: { id: string; content: { nodes: { name: string }[] } }[];
	};
}

/** A small architecture of two parts. */
const ARCHITECTURE = JSON.stringify({
	level: "system",
	nodes: [
		{ name: "Gateway", kind: "service", responsibility: "Takes every order" },
		{ name: "Store", kind: "datastore", responsibility: "Keeps every order" },
	],
	edges: [{ from: "Gateway", to: "Store", kind: "data", label: "write" }],
});

/** Draw `orders` from the models vault to a file, with what else is asked. */
function render(file: string, args: readonly string[], status = 0) {
	return cli(models, ["semantic", "render", "orders", "--out", file, ...args], { status });
}

const TRACK = ["--track", "--doing", "tracking where the orders picture is shown"];

/** The recipe a file carries. */
function recipeOf(file: string): RenderRecipe {
	const read = readRenderRecipe(fs.readFileSync(file));
	if (read.kind !== "recipe") throw new Error(`No recipe in ${file}`);
	return read.recipe;
}

/** The embeds part of one check in a repository. */
interface EmbedsPart {
	tracked: { board: { name: string }; repo: string; path: string }[];
	findings: {
		severity: string;
		code: string;
		file: string;
		embedRepo?: string;
		vaultRepo?: string | null;
	}[];
	fixed: { action: string; file: string; embedRepo?: string; movedFrom?: string | null }[];
}

/** Run `check embeds` in a repository. */
function checkEmbeds(repository: string, args: readonly string[], status: number): EmbedsPart {
	return JSON.parse(cli(repository, ["check", "embeds", ...args], { status }).stdout).embeds;
}

/** Each finding as `<severity> <code> <repo>:<file>`. */
const findings = (part: EmbedsPart) =>
	part.findings
		.map((one) => `${one.severity} ${one.code} ${one.embedRepo ?? "here"}:${one.file}`)
		.toSorted();

const svg = path.join(docs, "docs", "orders.svg");
const png = path.join(docs, "docs", "orders.png");

beforeAll(async () => {
	for (const [repository, identity] of [
		[models, MODELS],
		[docs, DOCS],
		[wiki, WIKI],
		[platform, PLATFORM],
	] as const) {
		fs.mkdirSync(repository, { recursive: true });
		git(repository, "init", "-q", "-b", "main");
		git(repository, "remote", "add", "origin", `https://${identity}.git`);
	}
	for (const holder of [models, docs, platform, loose]) {
		ensureSemanticVaultConfiguration(vaultIn(holder));
	}
	fs.mkdirSync(path.join(docs, "docs"), { recursive: true });
	fs.mkdirSync(outside, { recursive: true });
	fs.writeFileSync(path.join(docs, ".gitignore"), "build/\n");
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault: vaultIn(models),
		env: { ARCHBOARD_REPOS: at("repos.json") },
	});
	cli(models, ["semantic", "new", "orders", "--doing", "drawing a board to embed"], {
		input: ARCHITECTURE,
	});
	// A command in a checkout registers it; the wiki checkout is never registered.
	cli(docs, ["semantic", "list"]);
	cli(platform, ["semantic", "list"]);
}, TEST_WALL_CLOCK_BUDGET_MS);

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(root, { recursive: true, force: true });
});

describe("tracked embeds", () => {
	test(
		"--track lists the file once through a board write, and a refused --track writes no file",
		() => {
			const before = shown(models, "orders").version;
			// The board write needs --doing, and is made before the file is written.
			render(svg, ["--track"], 1);
			render(path.join(outside, "orders.svg"), TRACK, 2);
			render(path.join(docs, "build", "orders.svg"), TRACK, 2);
			cli(loose, ["semantic", "new", "loose", "--doing", "drawing a board"], {
				input: ARCHITECTURE,
			});
			cli(loose, ["semantic", "render", "loose", "--out", path.join(docs, "loose.svg"), ...TRACK], {
				status: 2,
			});
			for (const file of [svg, path.join(outside, "orders.svg"), path.join(docs, "loose.svg")]) {
				expect(fs.existsSync(file), file).toBe(false);
			}
			expect(shown(models, "orders").version).toBe(before);
			const receipt = JSON.parse(render(svg, TRACK).stdout);
			expect(receipt.tracked).toEqual({ repo: DOCS, path: "docs/orders.svg", version: before + 1 });
			expect(recipeOf(svg).board.name).toBe("orders");
			// Tracking it again writes nothing, and the version stays.
			expect(JSON.parse(render(svg, TRACK).stdout).tracked.version).toBe(before + 1);
			JSON.parse(cli(models, ["semantic", "rasterize", "orders", "--out", png, ...TRACK]).stdout);
			render(path.join(wiki, "orders.svg"), TRACK);
			render(path.join(docs, "docs", "gone.svg"), TRACK);
			fs.rmSync(path.join(docs, "docs", "gone.svg"));
			expect(shown(models, "orders").trackedEmbeds).toEqual([
				{ repo: DOCS, path: "docs/orders.svg" },
				{ repo: DOCS, path: "docs/orders.png" },
				{ repo: WIKI, path: "orders.svg" },
				{ repo: DOCS, path: "docs/gone.svg" },
			]);
			git(docs, "add", ".");
			git(docs, "commit", "-qm", "embed the orders board");
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"after a board edit the vault's check reports another repository's embed as information, and its own check as a warning",
		() => {
			const read = shown(models, "orders");
			const current = read.variants.find((variant) => variant.id === read.current);
			const store = current?.content.nodes.find((node) => node.name === "Store");
			cli(
				models,
				[
					"semantic",
					"edit",
					"orders",
					"--expect-version",
					String(read.version),
					"--doing",
					"changing what the embeds show",
				],
				{
					input: JSON.stringify({
						nodes: [{ ...store, responsibility: "Keeps every paid order" }],
					}),
				},
			);
			const vaultSide = checkEmbeds(models, [], 0);
			expect(vaultSide.tracked.map((one) => `${one.repo}:${one.path}`)).toHaveLength(4);
			expect(findings(vaultSide)).toEqual([
				`information EMBED_OUTDATED ${DOCS}:docs/orders.png`,
				`information EMBED_OUTDATED ${DOCS}:docs/orders.svg`,
				`information EMBED_TRACKED_MISSING ${DOCS}:docs/gone.svg`,
				`information EMBED_TRACKED_UNREACHABLE ${WIKI}:orders.svg`,
			]);
			expect(findings(checkEmbeds(docs, [], 1))).toEqual([
				"warning EMBED_OUTDATED here:docs/orders.png",
				"warning EMBED_OUTDATED here:docs/orders.svg",
			]);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"--fix in the vault's repository draws the tracked embeds again in the registered checkout, and names the one it cannot reach",
		() => {
			const fixed = checkEmbeds(models, ["--fix"], 0);
			expect(
				fixed.fixed.map((one) => `${one.action} ${one.embedRepo}:${one.file}`).toSorted(),
			).toEqual([`drawn ${DOCS}:docs/orders.png`, `drawn ${DOCS}:docs/orders.svg`]);
			expect(findings(fixed)).toEqual([
				`information EMBED_TRACKED_MISSING ${DOCS}:docs/gone.svg`,
				`information EMBED_TRACKED_UNREACHABLE ${WIKI}:orders.svg`,
			]);
			// The wiki's picture is as it was drawn, and the docs check finds nothing to draw.
			expect(recipeOf(path.join(wiki, "orders.svg")).fingerprint).not.toBe(
				recipeOf(svg).fingerprint,
			);
			expect(checkEmbeds(docs, [], 0).findings).toEqual([]);
			git(docs, "commit", "-qam", "draw the orders board again");
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"after a move the target vault's check names each recipe that names the old repository, and --fix writes the recipe again",
		() => {
			git(models, "add", ".");
			git(models, "commit", "-qm", "the orders board");
			const version = String(shown(models, "orders").version);
			cli(models, [
				"semantic",
				"move",
				"orders",
				"--to",
				platform,
				"--expect-version",
				version,
				"--doing",
				"moving the board into the platform repository",
			]);
			expect(shown(platform, "orders").trackedEmbeds).toHaveLength(4);
			const picture = recipeOf(svg).picture;
			expect(findings(checkEmbeds(platform, [], 0))).toEqual([
				`information EMBED_TRACKED_MISSING ${DOCS}:docs/gone.svg`,
				`information EMBED_TRACKED_UNREACHABLE ${WIKI}:orders.svg`,
				`information EMBED_VAULT_MOVED ${DOCS}:docs/orders.png`,
				`information EMBED_VAULT_MOVED ${DOCS}:docs/orders.svg`,
			]);
			const fixed = checkEmbeds(platform, ["--fix"], 0);
			expect(
				fixed.fixed.map((one) => `${one.action} ${one.file} ${one.movedFrom}`).toSorted(),
			).toEqual([`recipe docs/orders.png ${MODELS}`, `recipe docs/orders.svg ${MODELS}`]);
			expect(recipeOf(svg)).toMatchObject({ vault: { repo: PLATFORM }, picture });
			expect(recipeOf(png).vault.repo).toBe(PLATFORM);
			expect(checkEmbeds(docs, [], 0).findings).toEqual([]);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});
