// The bitmaps the harness takes of every final diagram a scenario asked for,
// through `archboard semantic rasterize`: the same capability a person uses,
// never a renderer of the harness's own. A capture is declared by the
// scenario, not derived from a check, so a read-only request and a failed run
// are captured like any other; a declared view that does not exist is a
// failed capture, never a default picture in its place. A large diagram is
// also cut into native-scale tiles so no detail is lost to a viewer that
// shrinks a big image.

import fs from "node:fs";
import path from "node:path";

import type { PageRegion } from "@/runtime/semantic-rasterizer/index";
import {
	SemanticRasterReceiptSchema,
	type SemanticRasterReceipt,
} from "@/runtime/semantic-rasterizer/receipt";
import {
	archboard,
	type CliAnswer,
	type CliContext,
} from "@/runtime/skill-evaluation/lib/archboard";
import { sequentially } from "@/runtime/skill-evaluation/lib/process";
import type { CaptureDeclaration } from "@/runtime/skill-evaluation/lib/suite";

/**
 * The longest side a capture keeps whole before it is also cut into tiles.
 * An image viewer that fits a picture to a few thousand pixels loses the
 * labels of a diagram wider than this; the tiles keep every pixel readable.
 */
const CAPTURE_TILE_SIDE_PX = 1600;

/** One native-scale tile of a large capture. */
interface CaptureTile extends PageRegion {
	readonly file: string;
}

/** What a capture is of: the saved content, exactly, and how it was shot. */
type CaptureProvenance = Readonly<
	Pick<
		SemanticRasterReceipt,
		"version" | "variant" | "view" | "theme" | "scale" | "width" | "height" | "diagram"
	> & {
		readonly svgSha256: SemanticRasterReceipt["source"]["svgSha256"];
		readonly facesLoaded: SemanticRasterReceipt["source"]["facesLoaded"];
		readonly motion: SemanticRasterReceipt["source"]["motion"];
	}
>;

/** One capture the harness attempted because the scenario declared it. */
interface CaptureAttempt extends CaptureDeclaration {
	readonly ok: boolean;
	readonly detail: string;
	/** Where the PNG landed, when it did. */
	readonly file?: string | undefined;
	readonly provenance?: CaptureProvenance | undefined;
	readonly tiles: readonly CaptureTile[];
}

/** What a run manifest says about its captures: which were declared, taken and not. */
interface CaptureSummary {
	readonly declared: readonly string[];
	readonly captured: readonly string[];
	readonly failed: readonly string[];
}

/**
 * The grid of tiles a bitmap needs, or none when it fits within the side.
 * @param width The bitmap width.
 * @param height The bitmap height.
 * @param side The longest side a tile may have.
 * @returns The tile rectangles, row by row.
 */
function tileRegions(width: number, height: number, side: number): PageRegion[] {
	if (width <= side && height <= side) return [];
	const regions: PageRegion[] = [];
	for (let y = 0; y < height; y += side) {
		for (let x = 0; x < width; x += side) {
			regions.push({ x, y, width: Math.min(side, width - x), height: Math.min(side, height - y) });
		}
	}
	return regions;
}

/**
 * Why the view a receipt drew is not the view that was declared, or null.
 * @param declaration What was asked for.
 * @param receipt What the command answered.
 * @returns The refusal, or null.
 */
function viewMismatch(
	declaration: CaptureDeclaration,
	receipt: SemanticRasterReceipt,
): string | null {
	if (declaration.view !== undefined && receipt.view === null) {
		return `the receipt drew the whole variant, not the "${declaration.view}" view`;
	}
	return grammarMismatch(declaration.grammar, receipt.view?.grammar ?? "architecture");
}

/**
 * Why the grammar a receipt drew is not the one declared, or null.
 * @param declared The grammar the declaration requires, if any.
 * @param drawn The grammar the receipt drew.
 * @returns The refusal, or null.
 */
function grammarMismatch(declared: string | undefined, drawn: string): string | null {
	if (declared === undefined || drawn === declared) return null;
	return `the receipt drew the ${drawn} grammar, not ${declared}`;
}

/**
 * Why a receipt is not the capture that was declared, or null when it is.
 * @param declaration What was asked for.
 * @param receipt What the command answered.
 * @returns The refusal, or null.
 */
function receiptMismatch(
	declaration: CaptureDeclaration,
	receipt: SemanticRasterReceipt,
): string | null {
	const view = viewMismatch(declaration, receipt);
	if (view !== null) return view;
	return receipt.scale === 1 ? null : `the receipt states scale ${receipt.scale}, not native`;
}

/** A receipt read off a command answer, or the reason there is none. */
type ReadReceipt = { receipt: SemanticRasterReceipt } | { failure: string };

/**
 * The receipt a successful command answer carries, or why it carries none.
 * @param answer What the command answered.
 * @returns The receipt, or the reason.
 */
function parsedReceipt(answer: CliAnswer): ReadReceipt {
	if (answer.exitCode !== 0) {
		const last = answer.stderr.trim().split("\n").at(-1) ?? "";
		return { failure: `rasterize failed (exit ${answer.exitCode ?? "none"}): ${last}` };
	}
	const parsed = SemanticRasterReceiptSchema.safeParse(answer.json);
	return parsed.success ? { receipt: parsed.data } : { failure: "rasterize answered no receipt" };
}

/**
 * Why a command answer is not the declared capture, or the receipt it carries.
 * @param declaration What was asked for.
 * @param answer What the command answered.
 * @param file Where the PNG was to land.
 * @returns The receipt, or the reason there is none.
 */
function receiptOf(declaration: CaptureDeclaration, answer: CliAnswer, file: string): ReadReceipt {
	const read = parsedReceipt(answer);
	if ("failure" in read) return read;
	const mismatch = receiptMismatch(declaration, read.receipt);
	if (mismatch !== null) return { failure: mismatch };
	if (!fs.existsSync(file)) return { failure: "rasterize answered but wrote no file" };
	return read;
}

/**
 * The capture record one command answer amounts to.
 * @param declaration What was asked for.
 * @param answer What the command answered: its exit code, its parsed JSON and its stderr.
 * @param file Where the PNG was to land.
 * @returns The attempt, without tiles.
 */
function captureFromReceipt(
	declaration: CaptureDeclaration,
	answer: CliAnswer,
	file: string,
): CaptureAttempt {
	const read = receiptOf(declaration, answer, file);
	if ("failure" in read) return { ...declaration, ok: false, detail: read.failure, tiles: [] };
	const receipt = read.receipt;
	return {
		...declaration,
		ok: true,
		detail: `captured ${receipt.width}×${receipt.height} of version ${receipt.version} to ${path.basename(file)}`,
		file,
		provenance: {
			version: receipt.version,
			variant: receipt.variant,
			view: receipt.view,
			theme: receipt.theme,
			scale: receipt.scale,
			width: receipt.width,
			height: receipt.height,
			diagram: receipt.diagram,
			svgSha256: receipt.source.svgSha256,
			facesLoaded: receipt.source.facesLoaded,
			motion: receipt.source.motion,
		},
		tiles: [],
	};
}

/**
 * The selectors a declaration adds to the command line.
 * @param declaration What was asked for.
 * @returns The arguments.
 */
function selectorsOf(declaration: CaptureDeclaration): string[] {
	return [
		...(declaration.variant === undefined ? [] : ["--variant", declaration.variant]),
		...(declaration.view === undefined ? [] : ["--view", declaration.view]),
	];
}

/**
 * Cut one successful capture into native-scale tiles when it is large.
 * @param cli How to reach the CLI.
 * @param attempt The capture.
 * @param stem The tile files' name before the tile index.
 * @returns The tiles that were drawn; a tile that failed is left out and noted in the detail.
 */
async function tilesOf(
	cli: CliContext,
	attempt: CaptureAttempt,
	stem: string,
): Promise<{ readonly tiles: CaptureTile[]; readonly failures: string[] }> {
	const provenance = attempt.provenance;
	if (provenance === undefined) return { tiles: [], failures: [] };
	const regions = tileRegions(provenance.width, provenance.height, CAPTURE_TILE_SIDE_PX);
	const failures: string[] = [];
	const tiles = await sequentially(regions, async (region, index) => {
		const file = `${stem}-tile-${index}.png`;
		const answer = await archboard(cli, [
			"semantic",
			"rasterize",
			attempt.board,
			"--out",
			file,
			"--region",
			`${region.x},${region.y},${region.width},${region.height}`,
			...selectorsOf(attempt),
		]);
		if (answer.exitCode !== 0 || !fs.existsSync(file)) {
			failures.push(`tile ${index} (${region.x},${region.y}) failed`);
			return null;
		}
		return { ...region, file };
	});
	return { tiles: tiles.filter((tile): tile is CaptureTile => tile !== null), failures };
}

/**
 * Take every capture a scenario declares, in order, into one directory.
 * @param cli How to reach the CLI.
 * @param declarations What the scenario asks to see.
 * @param directory Where the PNGs go.
 * @returns One attempt per declaration, failed ones included.
 */
function captureDeclared(
	cli: CliContext,
	declarations: readonly CaptureDeclaration[],
	directory: string,
): Promise<CaptureAttempt[]> {
	fs.mkdirSync(directory, { recursive: true });
	return sequentially(declarations, async (declaration, index) => {
		const stem = path.join(directory, `capture-${index}-${declaration.label}`);
		const file = `${stem}.png`;
		const answer = await archboard(cli, [
			"semantic",
			"rasterize",
			declaration.board,
			"--out",
			file,
			...selectorsOf(declaration),
		]);
		const attempt = captureFromReceipt(declaration, answer, file);
		if (!attempt.ok) return attempt;
		const cut = await tilesOf(cli, attempt, stem);
		return {
			...attempt,
			tiles: cut.tiles,
			detail:
				cut.failures.length === 0
					? attempt.detail
					: `${attempt.detail}; ${cut.failures.join(", ")}`,
		};
	});
}

/**
 * What a manifest records about the captures.
 * @param attempts The attempts.
 * @returns Which labels were declared, taken and not.
 */
function captureSummary(attempts: readonly CaptureAttempt[]): CaptureSummary {
	return {
		declared: attempts.map((attempt) => attempt.label),
		captured: attempts.filter((attempt) => attempt.ok).map((attempt) => attempt.label),
		failed: attempts.filter((attempt) => !attempt.ok).map((attempt) => attempt.label),
	};
}

export {
	CAPTURE_TILE_SIDE_PX,
	captureDeclared,
	captureFromReceipt,
	captureSummary,
	tileRegions,
	type CaptureAttempt,
	type CaptureProvenance,
	type CaptureSummary,
	type CaptureTile,
	type PageRegion,
};
