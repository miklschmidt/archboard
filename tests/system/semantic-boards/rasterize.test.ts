import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Window } from "happy-dom";
import { startOwnedServer, waitForProcessExit, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { readRenderRecipe } from "@archboard/renderer/recipe";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// The public path to a bitmap: `semantic rasterize` draws the same picture
// `semantic render` draws, headlessly, at native scale, through the same
// selectors, and touches nothing on the board while it does. The rasterizer's
// own owner proves pixels, bounds and teardown; this owner proves the command.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-semantic-rasterize-"));
const vault = vaultIn(holder);
let server: OwnedServer;

/**
 * Run one archboard command against the owned server.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string, env?: Readonly<Record<string, string>>) =>
	runServerCli({ repoRoot, server, args, input, env });

const VIEW_NAME = 'Transfer "quoted" & <exchange>';

/** A small system with one exchange and a view that reads it as a sequence. */
const architecture = {
	level: "system",
	nodes: [
		{ name: "Gateway", kind: "service", responsibility: "Takes every request" },
		{ name: "Ledger", kind: "service", responsibility: "Records every transfer" },
		{ name: "Vault", kind: "datastore", responsibility: "Holds every board as a file" },
		{ name: "Auditor", kind: "service", responsibility: "Reads the ledger nightly" },
	],
	edges: [
		{ from: "Gateway", to: "Ledger", kind: "call", label: "transfer", traffic: {} },
		{ from: "Ledger", to: "Vault", kind: "data", label: "append" },
		{ from: "Auditor", to: "Ledger", kind: "call", label: "reconcile" },
	],
	flows: [
		{
			name: "One transfer",
			participants: ["Gateway", "Ledger", "Vault"],
			steps: [
				{ from: "Gateway", to: "Ledger", label: "transfer" },
				{ from: "Ledger", to: "Vault", label: "append" },
				{ from: "Ledger", to: "Gateway", label: "receipt", kind: "return" },
			],
		},
	],
	views: [
		{
			name: VIEW_NAME,
			grammar: "sequence",
			scope: { kind: "selection", flows: ["One transfer"] },
		},
	],
};

/**
 * The size a PNG states in its header.
 * @param bytes The complete image bytes.
 * @returns Its width and height.
 */
function pngSize(bytes: Buffer): { width: number; height: number } {
	expect(bytes.subarray(0, 8)).toEqual(
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * The board file exactly as it is, to compare against later.
 * @returns Its bytes and modification time.
 */
function boardFile(): { bytes: string; mtimeNs: bigint } {
	const file = path.join(vault, "transfers.semantic.json");
	return {
		bytes: fs.readFileSync(file, "utf8"),
		mtimeNs: fs.statSync(file, { bigint: true }).mtimeNs,
	};
}

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const created = cli(
		["semantic", "new", "transfers", "--doing", "drawing the transfer path"],
		JSON.stringify(architecture),
	);
	expect(created.status, created.stderr).toBe(0);
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

describe("semantic rasterize", () => {
	test(
		"draws the board to a PNG the size the diagram states, and leaves the board alone",
		() => {
			const before = boardFile();
			const out = path.join(vault, "transfers.png");
			const drawn = cli(["semantic", "rasterize", "transfers", "--out", out]);
			expect(drawn.status, drawn.stderr).toBe(0);
			const receipt = JSON.parse(drawn.stdout);
			expect(receipt).toMatchObject({
				success: true,
				board: "transfers",
				version: 1,
				// A root variant came from nothing, so the picture is of it alone.
				comparedWith: null,
				view: null,
				// A bitmap cannot follow the reader's colour scheme, so it is drawn dark.
				theme: "dark",
				file: out,
				scale: 1,
				source: { renderer: "semantic-renderer", motion: "paused-at-start" },
			});
			expect(receipt.variant.lifecycle).toBe("current");
			expect(receipt.source.svgSha256).toMatch(/^[0-9a-f]{64}$/u);
			// Native scale: the bitmap is the diagram's own page, pixel for pixel.
			expect(pngSize(fs.readFileSync(out))).toEqual({
				width: receipt.width,
				height: receipt.height,
			});
			expect(receipt.diagram).toEqual({ width: receipt.width, height: receipt.height });
			// The same picture `semantic render` draws.
			const svgOut = path.join(vault, "transfers.svg");
			const rendered = JSON.parse(cli(["semantic", "render", "transfers", "--out", svgOut]).stdout);
			expect(rendered).toMatchObject({
				width: receipt.width,
				height: receipt.height,
				comparedWith: null,
			});
			// A pipe receives the same standalone SVG, including its accessibility metadata.
			const streamed = cli(["semantic", "render", "transfers"]);
			expect(streamed.status, streamed.stderr).toBe(0);
			expect(streamed.stdoutBytes).toEqual(fs.readFileSync(svgOut));
			expect(streamed.stdout).toMatch(/aria-label="[^"]+"/u);
			expect(boardFile()).toEqual(before);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"follows the same selectors as render: a sequence view, a proposal, a scale",
		() => {
			const before = boardFile();
			const sequence = path.join(vault, "exchange.png");
			const viewed = cli([
				"semantic",
				"rasterize",
				"transfers",
				"--view",
				VIEW_NAME,
				"--scale",
				"2",
				"--theme",
				"dark",
				"--out",
				sequence,
			]);
			expect(viewed.status, viewed.stderr).toBe(0);
			const receipt = JSON.parse(viewed.stdout);
			expect(receipt.view).toMatchObject({ name: VIEW_NAME, grammar: "sequence" });
			expect(receipt.theme).toBe("dark");
			expect(receipt.scale).toBe(2);
			expect(pngSize(fs.readFileSync(sequence))).toEqual({
				width: receipt.diagram.width * 2,
				height: receipt.diagram.height * 2,
			});
			const sequenceSvg = cli(["semantic", "render", "transfers", "--view", VIEW_NAME]);
			expect(sequenceSvg.status, sequenceSvg.stderr).toBe(0);
			expect(sequenceSvg.stdout).toMatch(/<desc>[^<]+<\/desc>/u);
			expect(boardFile()).toEqual(before);

			const branched = cli([
				"semantic",
				"branch",
				"transfers",
				"--as",
				"No auditor",
				"--summary",
				"Drop the auditor",
				"--expect-version",
				"1",
				"--doing",
				"proposing to drop the vault",
			]);
			expect(branched.status, branched.stderr).toBe(0);
			const edited = cli(
				[
					"semantic",
					"edit",
					"transfers",
					"--expect-version",
					"2",
					"--doing",
					"removing the auditor from the proposal",
				],
				JSON.stringify({ variant: "No auditor", removeNodes: ["Auditor"] }),
			);
			expect(edited.status, edited.stderr).toBe(0);
			const proposal = path.join(vault, "proposal.png");
			const compared = cli([
				"semantic",
				"rasterize",
				"transfers",
				"--variant",
				"No auditor",
				"--out",
				proposal,
			]);
			expect(compared.status, compared.stderr).toBe(0);
			const comparedReceipt = JSON.parse(compared.stdout);
			expect(comparedReceipt.variant).toMatchObject({ name: "No auditor", lifecycle: "draft" });
			// The picture of a variant with a predecessor is the comparison with it,
			// and the receipt names the other side neither file can say on its own.
			// Both drawing commands answer the same thing about the same picture.
			expect(comparedReceipt.comparedWith).toEqual(receipt.variant);
			const drawnSvg = cli([
				"semantic",
				"render",
				"transfers",
				"--variant",
				"No auditor",
				"--out",
				path.join(vault, "proposal.svg"),
			]);
			expect(drawnSvg.status, drawnSvg.stderr).toBe(0);
			expect(JSON.parse(drawnSvg.stdout).comparedWith).toEqual(comparedReceipt.comparedWith);
			// Both name what the picture draws and marks alike (TASK-496): the removed auditor too.
			const { drawn: svgDrawn, marks: svgMarks } = JSON.parse(drawnSvg.stdout);
			expect({ drawn: comparedReceipt.drawn, marks: comparedReceipt.marks }).toEqual({
				drawn: svgDrawn,
				marks: svgMarks,
			});
			expect(comparedReceipt.drawn.nodes).toContainEqual(
				expect.objectContaining({ name: "Auditor", standing: "removed" }),
			);

			// The plain SVG must omit the removed subject and every standing marker.
			const decorated = fs.readFileSync(path.join(vault, "proposal.svg"), "utf8");
			const plainPath = path.join(vault, "plain.svg");
			// The SVG a PNG is drawn from is in the PNG's theme, dark by default.
			const plainArgs = ["transfers", "--variant", "No auditor", "--no-comparison"];
			const darkPlain = [...plainArgs, "--theme", "dark"];
			const plainSvg = cli(["semantic", "render", ...darkPlain, "--out", plainPath]);
			expect(plainSvg.status, plainSvg.stderr).toBe(0);
			expect(JSON.parse(plainSvg.stdout).comparedWith).toBeNull();
			const plain = fs.readFileSync(plainPath, "utf8");
			expect(decorated).toContain("Auditor");
			expect(plain).not.toContain("Auditor");
			expect(plain).not.toContain('data-standing="removed"');
			expect(cli(["semantic", "render", ...darkPlain]).stdout).toBe(plain);
			const plainOut = path.join(vault, "plain.png");
			const plainPng = cli(["semantic", "rasterize", ...plainArgs, "--out", plainOut]);
			expect(plainPng.status, plainPng.stderr).toBe(0);
			const plainReceipt = JSON.parse(plainPng.stdout);
			expect(plainReceipt.comparedWith).toBeNull();
			// The bitmap command must consume the same undecorated SVG bytes.
			expect(plainReceipt.source.svgSha256).toBe(createHash("sha256").update(plain).digest("hex"));
			expect(comparedReceipt.version).toBe(3);
			expect(pngSize(fs.readFileSync(proposal))).toEqual({
				width: comparedReceipt.width,
				height: comparedReceipt.height,
			});
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"copies the captured PNG and self-contained HTML together, with clean failure output",
		async () => {
			const fixture = path.join(import.meta.dir, "fake-clipboard.ts");
			const recorded = path.join(vault, "copied.json");
			const env = { BUN_OPTIONS: `--preload=${fixture}`, ARCHBOARD_TEST_COPIED: recorded };
			const before = boardFile();
			const args = [
				"semantic",
				"rasterize",
				"transfers",
				"--variant",
				"No auditor",
				"--view",
				VIEW_NAME,
				"--no-comparison",
				"--theme",
				"dark",
				"--scale",
				"2",
				"--region",
				"0,0,120,80",
				"--clipboard",
			];
			const owners = new Set<number>();
			try {
				const copied = cli(args, undefined, env);
				expect(copied.status, copied.stderr).toBe(0);
				const receipt = JSON.parse(copied.stdout);
				expect(receipt).toMatchObject({
					board: "transfers",
					variant: { name: "No auditor" },
					view: { name: VIEW_NAME },
					comparedWith: null,
					theme: "dark",
					scale: 2,
					region: { x: 0, y: 0, width: 120, height: 80 },
					clipboard: { formats: ["image/png", "text/html"] },
				});
				expect(receipt.file).toBeUndefined();
				const sent = JSON.parse(fs.readFileSync(recorded, "utf8"));
				owners.add(sent.pid);
				expect(sent.formats).toEqual(["image/png", "text/html"]);
				const png = Buffer.from(sent.payload.png, "base64");
				expect(pngSize(png)).toEqual({ width: 240, height: 160 });
				// The copied bitmap, which the HTML holds too, carries its recipe.
				const region = { scale: 2, region: { x: 0, y: 0, width: 120, height: 80 } };
				const recipe = { comparison: "off", theme: "dark", raster: region };
				expect(readRenderRecipe(png)).toMatchObject({ kind: "recipe", recipe });
				const window = new Window();
				try {
					const rendered = cli([
						"semantic",
						"render",
						"transfers",
						"--variant",
						"No auditor",
						"--view",
						VIEW_NAME,
						"--no-comparison",
						"--theme",
						"dark",
					]);
					expect(rendered.status, rendered.stderr).toBe(0);
					window.document.body.innerHTML = rendered.stdout;
					const accessibleName = window.document.querySelector("svg")?.getAttribute("aria-label");
					expect(accessibleName).toBeTruthy();
					window.document.body.innerHTML = sent.payload.html;
					const image = window.document.querySelector("img");
					expect(window.document.querySelectorAll("*")).toHaveLength(4);
					expect(image?.getAttribute("src")).toBe(`data:image/png;base64,${sent.payload.png}`);
					expect(image?.getAttribute("alt")).toBe(receipt.clipboard.description);
					expect(image?.getAttribute("alt")).toContain(accessibleName!);
					expect(image?.getAttribute("alt")).toContain(VIEW_NAME);
					expect(image?.getAttribute("alt")).toContain("One transfer");
				} finally {
					await window.happyDOM.close();
				}
				expect(boardFile()).toEqual(before);
				// An identical export gets a fresh identity and retires the first Linux owner.
				const repeated = cli(args, undefined, env);
				expect(repeated.status, repeated.stderr).toBe(0);
				const replacement = JSON.parse(fs.readFileSync(recorded, "utf8"));
				owners.add(replacement.pid);
				expect(replacement.payload.html).not.toBe(sent.payload.html);
				await waitForProcessExit(sent.pid);
				fs.rmSync(recorded);
				await waitForProcessExit(replacement.pid);
				const conflict = cli([...args, "--out", path.join(vault, "conflict.png")], undefined, env);
				expect(conflict.status).toBe(2);
				expect(conflict.stdoutBytes).toHaveLength(0);
				expect(fs.existsSync(recorded)).toBe(false);
				const refused = cli(args, undefined, { ...env, ARCHBOARD_TEST_CLIPBOARD_FAIL: "1" });
				expect(refused.status).toBe(1);
				expect(refused.stdoutBytes).toHaveLength(0);
				expect(fs.existsSync(recorded)).toBe(false);
			} finally {
				// Even a failed assertion must retire the latest published helper.
				if (fs.existsSync(recorded)) {
					owners.add(JSON.parse(fs.readFileSync(recorded, "utf8")).pid);
				}
				fs.rmSync(recorded, { force: true });
				await Promise.all([...owners].map((pid) => waitForProcessExit(pid)));
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"carries a title and the legend, or the legend alone, from either command into the picture",
		() => {
			const before = boardFile();
			const plain = JSON.parse(
				cli(["semantic", "render", "transfers", "--out", path.join(vault, "plain.svg")]).stdout,
			);
			const framed = cli(["semantic", "render", "transfers", "--title", "--legend", "vertical"]);
			expect(framed.status, framed.stderr).toBe(0);
			const words =
				/data-slot="export-title">(?:<g [^>]*aria-hidden="true">[^]*?<\/g>)?<text [^>]*>([^<]*)</u.exec(
					framed.stdout,
				)?.[1];
			expect(words).toContain("transfers");
			expect(words).toContain(plain.variant.name);
			expect(framed.stdout).toContain('data-slot="export-legend" data-layout="vertical"');
			const aloneFlags = ["--title", "Transfers", "--legend-only", "--theme", "dark"];
			const alone = cli(["semantic", "render", "transfers", ...aloneFlags]);
			expect(alone.stdout).toContain('data-slot="export-legend" data-layout="horizontal"');
			expect(alone.stdout).not.toContain('data-semantic-id="');
			const out = path.join(vault, "framed.png");
			const png = cli(["semantic", "rasterize", "transfers", ...aloneFlags, "--out", out]);
			expect(png.status, png.stderr).toBe(0);
			const receipt = JSON.parse(png.stdout);
			// The PNG is a bitmap of the legend alone that render draws, and holds all of it.
			expect(receipt.source.svgSha256).toBe(
				createHash("sha256").update(alone.stdoutBytes).digest("hex"),
			);
			expect(pngSize(fs.readFileSync(out))).toEqual({
				width: receipt.width,
				height: receipt.height,
			});
			// A title with no words, and no legend with a legend, are refused.
			const refusals = [
				["--title", ""],
				["--title", " "],
				["--legend-only", "--no-legend"],
				["--legend", "vertical", "--no-legend"],
			];
			for (const command of ["render", "rasterize"]) {
				for (const refused of refusals) {
					const answer = cli(["semantic", command, "transfers", ...refused]);
					expect(answer.status, refused.join(" ")).toBe(2);
					expect(answer.stdoutBytes).toHaveLength(0);
				}
			}
			expect(boardFile()).toEqual(before);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"pipes a PNG region without a file and refuses invalid images without stdout bytes",
		() => {
			const out = path.join(vault, "never.png");
			const missing = cli(["semantic", "render", "missing-board"]);
			expect(missing.status).not.toBe(0);
			expect(missing.stdoutBytes).toHaveLength(0);
			const unknownView = cli(["semantic", "rasterize", "transfers", "--view", "Nowhere"]);
			expect(unknownView.status).not.toBe(0);
			expect(unknownView.stdoutBytes).toHaveLength(0);
			expect(fs.existsSync(out)).toBe(false);
			const badScale = cli(["semantic", "rasterize", "transfers", "--scale", "9", "--out", out]);
			expect(badScale.status).toBe(2);
			expect(fs.existsSync(out)).toBe(false);
			// A region is a native-detail tile of the page and never reaches past it.
			const outside = cli([
				"semantic",
				"rasterize",
				"transfers",
				"--region",
				"100000,0,10,10",
				"--out",
				out,
			]);
			expect(outside.status).toBe(2);
			expect(fs.existsSync(out)).toBe(false);
			const beforeRegion = boardFile();
			const filesBeforeRegion = fs.readdirSync(vault).toSorted();
			const region = cli(["semantic", "rasterize", "transfers", "--region", "0,0,120,80"]);
			expect(region.status, region.stderr).toBe(0);
			expect(pngSize(region.stdoutBytes)).toEqual({ width: 120, height: 80 });
			// The pipe ends at PNG's IEND chunk, with no receipt or text appended.
			expect(region.stdoutBytes.subarray(-12)).toEqual(
				Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
			);
			expect(fs.readdirSync(vault).toSorted()).toEqual(filesBeforeRegion);
			expect(boardFile()).toEqual(beforeRegion);
			const empty = cli(
				["semantic", "new", "blank", "--doing", "starting an empty board"],
				JSON.stringify({ level: "system" }),
			);
			expect(empty.status, empty.stderr).toBe(0);
			const nothing = cli(["semantic", "rasterize", "blank"]);
			expect(nothing.status).toBe(2);
			expect(nothing.stdoutBytes).toHaveLength(0);
			expect(fs.existsSync(out)).toBe(false);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});
