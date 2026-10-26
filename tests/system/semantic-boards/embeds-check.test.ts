import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import {
	embedRecipeInPng,
	readRenderRecipe,
	replaceRenderRecipe,
	type RenderRecipe,
} from "@archboard/renderer/recipe";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// `archboard check embeds` over a real server and two Git repositories (ADR
// 0057, TASK-526.03). The docs repository keeps embeds of its own boards and
// of a board in the models repository, a registered checkout. After a board
// edit, a rename, a deletion whose name another board took, and an edit in the
// other vault, the check names each embed by its code; `--fix` draws them
// again, re-points the one that can follow the name, leaves a PNG it cannot
// draw without Chromium reported, and with Chromium leaves nothing to fix.
// Inline SVG pages, ignored files and files without a recipe are no embeds.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-embeds-")));
const docs = path.join(root, "docs");
const models = path.join(root, "models");
const docsVault = vaultIn(docs);
const modelsVault = vaultIn(models);
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

/** A command in a repository, against the server, that must exit as expected. */
function cli(
	repository: string,
	args: readonly string[],
	options: {
		input?: string | undefined;
		env?: Record<string, string> | undefined;
		status?: number;
	} = {},
) {
	const run = runServerCli({
		repoRoot,
		server,
		vault: path.join(repository, ".archboard", "vault"),
		args,
		input: options.input,
		env: options.env,
	});
	expect(run.status, `${args.join(" ")}: ${run.stderr}`).toBe(options.status ?? 0);
	return run;
}

/** A board as `semantic show` reads it. */
function shown(repository: string, board: string) {
	return JSON.parse(cli(repository, ["semantic", "show", board]).stdout).board as {
		id: string;
		version: number;
		current: string;
		variants: { id: string; content: { nodes: { id: string; name: string }[] } }[];
	};
}

/** A write at the board's version. */
function write(repository: string, board: string, args: readonly string[], input?: string): void {
	const version = String(shown(repository, board).version);
	cli(
		repository,
		[...args, "--expect-version", version, "--doing", "changing what an embed shows"],
		{
			input,
		},
	);
}

/** Give a board's node another responsibility on its current variant. */
function reword(repository: string, board: string, node: string, responsibility: string): void {
	const read = shown(repository, board);
	const current = read.variants.find((variant) => variant.id === read.current);
	const found = current?.content.nodes.find((one) => one.name === node);
	write(
		repository,
		board,
		["semantic", "edit", board],
		JSON.stringify({ nodes: [{ ...found, responsibility }] }),
	);
}

/** A small architecture of three parts, one of them outside the view. */
const architecture = (name: string) =>
	JSON.stringify({
		level: "system",
		nodes: [
			{ name: `${name} gateway`, kind: "service", responsibility: "Takes every request" },
			{ name: `${name} store`, kind: "datastore", responsibility: "Keeps every record" },
			{ name: "Auditor", kind: "service", responsibility: "Reads nothing yet" },
		],
		edges: [{ from: `${name} gateway`, to: `${name} store`, kind: "data", label: "write" }],
		views: [
			{
				name: "Front",
				grammar: "architecture",
				scope: { kind: "selection", nodes: [`${name} gateway`] },
			},
		],
	});

/** The recipe some bytes carry. */
function recipeIn(bytes: Uint8Array): RenderRecipe {
	const read = readRenderRecipe(bytes);
	if (read.kind !== "recipe") throw new Error(`No recipe: ${JSON.stringify(read)}`);
	return read.recipe;
}

/** The recipe a file of the docs checkout carries. */
const recipeOf = (file: string): RenderRecipe => recipeIn(fs.readFileSync(path.join(docs, file)));

/** One PNG chunk with its length and CRC. */
function pngChunk(type: string, data: Uint8Array): Buffer {
	const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
	const framed = Buffer.alloc(12 + data.length);
	framed.writeUInt32BE(data.length, 0);
	typed.copy(framed, 4);
	framed.writeUInt32BE(crc32(typed), 8 + data.length);
	return framed;
}

/** A 2×1 greyscale PNG: a bitmap that stands for one nobody has drawn again yet. */
const PNG = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	pngChunk("IHDR", Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 0, 0, 0, 0])),
	pngChunk("IDAT", deflateSync(Buffer.from([0, 0x40, 0xc0]))),
	pngChunk("IEND", Buffer.alloc(0)),
]);

/** The embeds part of one check, by file. */
interface EmbedsPart {
	checkout: string | null;
	embeds: string[];
	vaults: { source: string; repo: string }[];
	findings: {
		severity: string;
		code: string;
		file: string;
		missing?: string;
		notFixed?: string;
		removedIn?: { commit: string };
		nameHeldBy?: { id: string };
	}[];
	fixed: {
		action: string;
		file: string;
		code?: string;
		from?: { id: string };
		to?: { id: string };
	}[];
}

/** Run the embeds check in the docs repository. */
function checkEmbeds(
	args: readonly string[],
	status: number,
	env?: Record<string, string>,
): EmbedsPart {
	return JSON.parse(cli(docs, ["check", "embeds", ...args], { status, env }).stdout).embeds;
}

const codes = (part: EmbedsPart) =>
	Object.fromEntries(part.findings.map((finding) => [finding.file, finding.code]));
const fixes = (part: EmbedsPart) =>
	Object.fromEntries(part.fixed.map((fix) => [fix.file, fix.action]));

/** Each board's id, by the name the test knows it by. */
const ids = new Map<string, string>();

/**
 * The id a board was given.
 * @param name The name the test knows it by.
 * @returns The id.
 */
function idOf(name: string): string {
	const id = ids.get(name);
	if (id === undefined) throw new Error(`No board ${name} was drawn`);
	return id;
}

let removal = "";
const inline = `<!doctype html><p>A board</p>\n`;

beforeAll(async () => {
	ensureSemanticVaultConfiguration(modelsVault);
	for (const [repository, origin] of [
		[docs, "https://github.com/example/docs.git"],
		[models, "https://github.com/example/models.git"],
	] as const) {
		git(repository, "init", "-q", "-b", "main");
		git(repository, "remote", "add", "origin", origin);
	}
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault: docsVault,
		env: { ARCHBOARD_REPOS: path.join(root, "repos.json") },
	});
	for (const board of ["ledger", "payments", "queue"]) {
		cli(docs, ["semantic", "new", board, "--doing", "drawing a board to embed"], {
			input: architecture(board),
		});
		ids.set(board, shown(docs, board).id);
	}
	// Running a command in the models checkout registers it as the chosen checkout of its repository.
	cli(models, ["semantic", "new", "orders", "--doing", "drawing a board to embed"], {
		input: architecture("orders"),
	});
	const out = (file: string, ...args: string[]) =>
		cli(docs, ["semantic", "render", ...args, "--out", path.join(docs, "docs", file)]);
	fs.mkdirSync(path.join(docs, "docs"), { recursive: true });
	out("ledger.svg", "ledger");
	out("ledger-front.svg", "ledger", "--view", "Front");
	out("payments.svg", "payments");
	out("queue.svg", "queue");
	out("queue-front.svg", "queue", "--view", "Front");
	cli(docs, [
		"semantic",
		"render",
		"-C",
		models,
		"orders",
		"--out",
		path.join(docs, "docs", "orders.svg"),
	]);
	const payments = fs.readFileSync(path.join(docs, "docs", "payments.svg"));
	const recipe = recipeOf("docs/payments.svg");
	const put = (file: string, bytes: Uint8Array | string) =>
		fs.writeFileSync(path.join(docs, "docs", file), bytes);
	// The same board drawn by another renderer: only the picture digest differs.
	put(
		"renderer.svg",
		replaceRenderRecipe(payments, { ...recipe, picture: `sha256:${"0".repeat(64)}` }),
	);
	put(
		"elsewhere.svg",
		// A vault in no repository: a repository this machine has no checkout of
		// is fetched, which embeds-fetch.test.ts owns.
		replaceRenderRecipe(payments, { ...recipe, vault: { repo: null } }),
	);
	put("broken.svg", payments.toString("utf8").replace('"recipe":1', '"recipe":2'));
	const dark = recipeIn(cli(docs, ["semantic", "render", "ledger", "--theme", "dark"]).stdoutBytes);
	put("ledger.png", embedRecipeInPng(PNG, { ...dark, raster: { scale: 1, region: null } }));
	put("page.html", `${inline}${payments.toString("utf8")}`);
	put("page.mdx", `# A board\n\n${payments.toString("utf8")}`);
	// Named as an SVG, and a page that holds one.
	put("wrapped.svg", `${inline}${payments.toString("utf8")}`);
	put("plain.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
	put("ignored.svg", payments);
	fs.writeFileSync(path.join(docs, ".gitignore"), "docs/ignored.svg\n");
	git(docs, "add", ".");
	git(docs, "commit", "-qm", "embed the boards");
	put("untracked.svg", payments);
	// The board edit: the overview draws the auditor, and the view leaves it out.
	reword(docs, "ledger", "Auditor", "Reads the ledger every night");
	write(docs, "payments", ["semantic", "rename", "payments", "--to", "billing"]);
	git(docs, "rm", "-q", ".archboard/vault/queue.semantic.json");
	git(docs, "commit", "-qm", "remove the queue board");
	removal = git(docs, "rev-parse", "HEAD");
	cli(docs, ["semantic", "new", "queue", "--doing", "drawing the board that takes the name"], {
		input: architecture("queue"),
	});
	ids.set("new queue", shown(docs, "queue").id);
	// The other vault, as its checkout holds it: an edit nobody committed.
	reword(models, "orders", "orders store", "Keeps every order");
}, TEST_WALL_CLOCK_BUDGET_MS);

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(root, { recursive: true, force: true });
});

describe("check embeds", () => {
	test(
		"names each outdated embed by its code, finds a renamed board by id, and reads no page, ignored or plain file",
		() => {
			const part = checkEmbeds([], 1);
			expect(part.checkout).toBe(docs);
			expect(part.embeds.toSorted()).toEqual(
				[
					"broken",
					"elsewhere",
					"ledger-front",
					"ledger",
					"orders",
					"payments",
					"queue-front",
					"queue",
					"renderer",
				]
					.map((name) => `docs/${name}.svg`)
					.concat("docs/ledger.png")
					.toSorted(),
			);
			expect(codes(part)).toEqual({
				"docs/broken.svg": "EMBED_RECIPE_UNREADABLE",
				"docs/elsewhere.svg": "EMBED_VAULT_UNAVAILABLE",
				"docs/ledger.png": "EMBED_OUTDATED",
				"docs/ledger.svg": "EMBED_OUTDATED",
				"docs/orders.svg": "EMBED_OUTDATED",
				"docs/queue-front.svg": "EMBED_SOURCE_MISSING",
				"docs/queue.svg": "EMBED_SOURCE_MISSING",
				"docs/renderer.svg": "EMBED_RENDERER_CHANGED",
			});
			const severity = Object.fromEntries(part.findings.map((one) => [one.code, one.severity]));
			expect(severity).toMatchObject({
				EMBED_OUTDATED: "warning",
				EMBED_SOURCE_MISSING: "warning",
				EMBED_RECIPE_UNREADABLE: "warning",
				EMBED_RENDERER_CHANGED: "information",
				EMBED_VAULT_UNAVAILABLE: "information",
			});
			const queue = part.findings.find((one) => one.file === "docs/queue.svg");
			expect(queue).toMatchObject({
				missing: "board",
				removedIn: { commit: removal },
				nameHeldBy: { id: idOf("new queue") },
			});
			expect(part.fixed).toEqual([]);
			// Each registered checkout's vault is read as it holds it, never fetched.
			expect(part.vaults).toEqual([
				{ source: "checkout", repo: "github.com/example/docs" },
				{ source: "checkout", repo: "github.com/example/models" },
			]);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"--fix without Chromium draws the SVGs again, re-points the one that can follow the name, and leaves the PNG reported",
		() => {
			const before = fs.readFileSync(path.join(docs, "docs", "page.html"));
			const part = checkEmbeds(["--fix"], 1, {
				ARCHBOARD_RENDERER_CHROMIUM: path.join(root, "no-chromium"),
			});
			expect(fixes(part)).toEqual({
				"docs/ledger.svg": "drawn",
				"docs/ledger-front.svg": "recipe",
				"docs/orders.svg": "drawn",
				"docs/payments.svg": "recipe",
				"docs/queue.svg": "re-pointed",
				"docs/renderer.svg": "drawn",
			});
			expect(part.fixed.find((fix) => fix.file === "docs/queue.svg")).toMatchObject({
				from: { id: idOf("queue") },
				to: { id: idOf("new queue") },
			});
			expect(recipeOf("docs/queue.svg").board).toEqual({ id: idOf("new queue"), name: "queue" });
			expect(recipeOf("docs/payments.svg").board).toEqual({
				id: idOf("payments"),
				name: "billing",
			});
			expect(codes(part)).toEqual({
				"docs/broken.svg": "EMBED_RECIPE_UNREADABLE",
				"docs/elsewhere.svg": "EMBED_VAULT_UNAVAILABLE",
				"docs/ledger.png": "EMBED_OUTDATED",
				"docs/queue-front.svg": "EMBED_SOURCE_MISSING",
			});
			expect(part.findings.find((one) => one.file === "docs/ledger.png")?.notFixed).toEqual(
				expect.any(String),
			);
			expect(fs.readFileSync(path.join(docs, "docs", "page.html"))).toEqual(before);
			// --fix writes only in this checkout: the other vault's checkout is as it was.
			expect(git(models, "status", "--porcelain", "--", ":!.archboard")).toBe("");
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"--fix with Chromium draws the PNG again, exits 0 when nothing remains, and rewrites nothing the second time",
		() => {
			git(docs, "rm", "-q", "docs/broken.svg", "docs/queue-front.svg");
			const outdated = recipeOf("docs/ledger.png");
			const part = checkEmbeds(["--fix"], 0);
			expect(part.fixed).toEqual([
				{ action: "drawn", file: "docs/ledger.png", code: "EMBED_OUTDATED" },
			]);
			expect(recipeOf("docs/ledger.png")).toMatchObject({
				raster: { scale: 1, region: null },
				theme: "dark",
			});
			expect(codes(part)).toEqual({ "docs/elsewhere.svg": "EMBED_VAULT_UNAVAILABLE" });
			// A PNG cut to a region the drawing does not reach is refused, as `rasterize --region` refuses it.
			const region = { x: 100_000, y: 0, width: 10, height: 10 };
			const corner = embedRecipeInPng(PNG, { ...outdated, raster: { scale: 1, region } });
			fs.writeFileSync(path.join(docs, "docs", "corner.png"), corner);
			git(docs, "add", "docs/corner.png");
			const again = checkEmbeds(["--fix"], 1);
			expect(again.fixed).toEqual([]);
			expect(codes(again)).toEqual({
				"docs/corner.png": "EMBED_OUTDATED",
				"docs/elsewhere.svg": "EMBED_VAULT_UNAVAILABLE",
			});
			expect(again.findings.find((one) => one.file === "docs/corner.png")?.notFixed).toEqual(
				expect.any(String),
			);
			expect(fs.readFileSync(path.join(docs, "docs", "corner.png"))).toEqual(Buffer.from(corner));
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	// Root writes into a directory without write permission, so nothing stops the run there.
	test.skipIf(process.getuid?.() === 0)(
		"a --fix that stops midway names each file it rewrote before, and writes none after",
		() => {
			const locked = path.join(docs, "locked");
			fs.mkdirSync(locked);
			cli(docs, ["semantic", "render", "ledger", "--out", path.join(locked, "ledger.svg")]);
			git(docs, "add", "locked/ledger.svg");
			reword(docs, "ledger", "Auditor", "Reads the ledger every hour");
			const before = fs.readFileSync(path.join(locked, "ledger.svg"));
			fs.chmodSync(locked, 0o555);
			try {
				const run = cli(docs, ["check", "embeds", "--fix"], {
					status: 1,
					env: { ARCHBOARD_RENDERER_CHROMIUM: path.join(root, "no-chromium") },
				});
				expect(run.stderr).toContain("docs/ledger.svg");
				expect(run.stderr).toContain("docs/ledger-front.svg");
				expect(recipeOf("docs/ledger.svg").fingerprint).not.toBe(recipeIn(before).fingerprint);
				expect(fs.readFileSync(path.join(locked, "ledger.svg"))).toEqual(before);
			} finally {
				fs.chmodSync(locked, 0o755);
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});
