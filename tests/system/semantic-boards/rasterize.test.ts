import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

// The public path to a bitmap: `semantic rasterize` draws the same picture
// `semantic render` draws, headlessly, at native scale, through the same
// selectors, and touches nothing on the board while it does. The rasterizer's
// own owner proves pixels, bounds and teardown; this owner proves the command.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-semantic-rasterize-"));
let canvas: OwnedCanvas;

/**
 * Run one archboard command against the owned canvas.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runCanvasCli({ repoRoot, vault, base: canvas.base, args, input });

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
			name: "Transfer exchange",
			grammar: "data-flow",
			scope: { kind: "selection", flows: ["One transfer"] },
		},
	],
};

/**
 * The size a PNG states in its header.
 * @param file The file.
 * @returns Its width and height.
 */
function pngSize(file: string): { width: number; height: number } {
	const bytes = fs.readFileSync(file);
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
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
	const created = cli(
		["semantic", "new", "transfers", "--doing", "drawing the transfer path"],
		JSON.stringify(architecture),
	);
	expect(created.status, created.stderr).toBe(0);
});

afterAll(async () => {
	await canvas?.dispose();
	fs.rmSync(vault, { recursive: true, force: true });
});

describe("semantic rasterize", () => {
	test("draws the board to a PNG the size the diagram states, and leaves the board alone", () => {
		const before = boardFile();
		const out = path.join(vault, "transfers.png");
		const drawn = cli(["semantic", "rasterize", "transfers", "--out", out]);
		expect(drawn.status, drawn.stderr).toBe(0);
		const receipt = JSON.parse(drawn.stdout);
		expect(receipt).toMatchObject({
			success: true,
			board: "transfers",
			version: 1,
			view: null,
			theme: "light",
			file: out,
			scale: 1,
			source: { renderer: "semantic-renderer", fonts: "embedded", motion: "paused-at-start" },
		});
		expect(receipt.variant.lifecycle).toBe("current");
		expect(receipt.source.svgSha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(receipt.source.facesLoaded).toBeGreaterThan(0);
		// Native scale: the bitmap is the diagram's own page, pixel for pixel.
		expect(pngSize(out)).toEqual({ width: receipt.width, height: receipt.height });
		expect(receipt.diagram).toEqual({ width: receipt.width, height: receipt.height });
		// The same picture `semantic render` draws.
		const svgOut = path.join(vault, "transfers.svg");
		const rendered = JSON.parse(cli(["semantic", "render", "transfers", "--out", svgOut]).stdout);
		expect(rendered).toMatchObject({ width: receipt.width, height: receipt.height });
		expect(boardFile()).toEqual(before);
	}, 30_000);

	test("follows the same selectors as render: a data-flow view, a proposal, a scale", () => {
		const before = boardFile();
		const sequence = path.join(vault, "exchange.png");
		const viewed = cli([
			"semantic",
			"rasterize",
			"transfers",
			"--view",
			"Transfer exchange",
			"--scale",
			"2",
			"--theme",
			"dark",
			"--out",
			sequence,
		]);
		expect(viewed.status, viewed.stderr).toBe(0);
		const receipt = JSON.parse(viewed.stdout);
		expect(receipt.view).toMatchObject({ name: "Transfer exchange", grammar: "data-flow" });
		expect(receipt.theme).toBe("dark");
		expect(receipt.scale).toBe(2);
		expect(pngSize(sequence)).toEqual({
			width: receipt.diagram.width * 2,
			height: receipt.diagram.height * 2,
		});
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
		expect(comparedReceipt.version).toBe(3);
		expect(pngSize(proposal)).toEqual({
			width: comparedReceipt.width,
			height: comparedReceipt.height,
		});
	}, 60_000);

	test("refuses an unknown view, a bad scale and an empty board without leaving a file", () => {
		const out = path.join(vault, "never.png");
		const unknownView = cli([
			"semantic",
			"rasterize",
			"transfers",
			"--view",
			"Nowhere",
			"--out",
			out,
		]);
		expect(unknownView.status).not.toBe(0);
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
		const tile = path.join(vault, "tile.png");
		const region = cli([
			"semantic",
			"rasterize",
			"transfers",
			"--region",
			"0,0,120,80",
			"--out",
			tile,
		]);
		expect(region.status, region.stderr).toBe(0);
		expect(JSON.parse(region.stdout).region).toEqual({ x: 0, y: 0, width: 120, height: 80 });
		expect(pngSize(tile)).toEqual({ width: 120, height: 80 });
		const empty = cli(
			["semantic", "new", "blank", "--doing", "starting an empty board"],
			JSON.stringify({ level: "system" }),
		);
		expect(empty.status, empty.stderr).toBe(0);
		const nothing = cli(["semantic", "rasterize", "blank", "--out", out]);
		expect(nothing.status).toBe(2);
		expect(fs.existsSync(out)).toBe(false);
	}, 30_000);
});
