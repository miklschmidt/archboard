// Images reach the grader on every grading call, including a resumed call:
// attached by the harness for Codex, opened from the workspace by Claude with
// the stream showing which. A receipt belongs to the exact filed verdict and
// image bytes; the grader cannot create its own proof that pictures reached it.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readPngDimensions } from "@/runtime/semantic-rasterizer";
import { CAPTURE_TILE_SIDE_PX, tileRegions } from "@/runtime/skill-evaluation/lib/captures";
import { graderLayout } from "@/runtime/skill-evaluation/lib/grader-layout";
import type { GraderName } from "@/runtime/skill-evaluation/lib/suite";

const SizeSchema = z.object({ width: z.int().positive(), height: z.int().positive() });
const TileSchema = SizeSchema.extend({ x: z.number(), y: z.number(), file: z.string() });
const CaptureSchema = z.object({
	label: z.string(),
	ok: z.boolean(),
	file: z.string().nullable(),
	provenance: SizeSchema.nullable(),
	tiles: z.array(TileSchema),
});
const BundleSchema = z.object({ captures: z.array(CaptureSchema).optional() });
const ImageSchema = SizeSchema.extend({
	capture: z.string(),
	file: z.string(),
	sha256: z.string(),
});
const RunImagesSchema = z.object({
	run: z.string(),
	images: z.array(ImageSchema),
	suppliedCaptures: z.array(z.string()),
	failures: z.array(z.object({ capture: z.string(), detail: z.string() })),
});
const ReceiptSchema = RunImagesSchema.extend({ verdictSha256: z.string() });
type RunImages = z.infer<typeof RunImagesSchema>;
type SuppliedImage = z.infer<typeof ImageSchema>;
type BundledCapture = z.infer<typeof CaptureSchema>;

/**
 * Content identity for a filed verdict or an attached image.
 * @param bytes The content.
 * @returns Its digest.
 */
function digest(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Validate one PNG and record its exact bytes under a blinded relative path.
 * @param workspace The grading workspace.
 * @param run The anonymous run.
 * @param capture The capture label.
 * @param file The run-relative image file.
 * @param size The expected dimensions.
 * @returns The attachment receipt.
 */
function imageOf(
	workspace: string,
	run: string,
	capture: string,
	file: string,
	size: z.infer<typeof SizeSchema>,
): SuppliedImage {
	const relative = path.join("runs", run, file);
	const absolute = path.resolve(workspace, relative);
	if (!absolute.startsWith(`${path.resolve(workspace, "runs", run, "captures")}${path.sep}`)) {
		throw new Error("the image is outside this run's capture directory");
	}
	const bytes = fs.readFileSync(absolute);
	const dimensions = readPngDimensions(bytes);
	if (dimensions.width !== size.width || dimensions.height !== size.height) {
		throw new Error("the PNG dimensions disagree with its capture provenance");
	}
	return { capture, file: relative, ...dimensions, sha256: digest(bytes) };
}

/**
 * Every required main image and native detail tile for a capture.
 * @param workspace The grading workspace.
 * @param run The anonymous run.
 * @param capture The bundled capture.
 * @returns All its attachments, or a refusal if any required picture is absent.
 */
function captureImages(workspace: string, run: string, capture: BundledCapture): SuppliedImage[] {
	if (!capture.ok || capture.file === null || capture.provenance === null) {
		throw new Error("the harness did not capture this diagram");
	}
	const images = [imageOf(workspace, run, capture.label, capture.file, capture.provenance)];
	const regions = tileRegions(
		capture.provenance.width,
		capture.provenance.height,
		CAPTURE_TILE_SIDE_PX,
	);
	for (const region of regions) {
		const tile = capture.tiles.find(
			(entry) =>
				entry.x === region.x &&
				entry.y === region.y &&
				entry.width === region.width &&
				entry.height === region.height,
		);
		if (tile === undefined) throw new Error("a required native-resolution tile is missing");
		images.push(imageOf(workspace, run, capture.label, tile.file, region));
	}
	return images;
}

/**
 * Read the harness's capture list, validating pictures before attaching them.
 * @param workspace The grading workspace.
 * @param run The anonymous run.
 * @returns Available attachments and explicit failures; absent historical captures supply nothing.
 */
function imagesForRun(workspace: string, run: string): RunImages {
	const bundle = BundleSchema.parse(
		JSON.parse(fs.readFileSync(path.join(workspace, "runs", run, "bundle.json"), "utf8")),
	);
	const result: RunImages = { run, images: [], suppliedCaptures: [], failures: [] };
	for (const capture of bundle.captures ?? []) {
		try {
			result.images.push(...captureImages(workspace, run, capture));
			result.suppliedCaptures.push(capture.label);
		} catch (error) {
			result.failures.push({
				capture: capture.label,
				detail: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return result;
}

/**
 * Write a delivery receipt only for a successful grading call's exact verdict.
 * @param verdictFile The filed verdict.
 * @param images The images supplied on that call, or null for an unsuccessful call.
 */
function fileImageReceipt(verdictFile: string, images: RunImages | null): void {
	const file = `${verdictFile}.images.json`;
	fs.rmSync(file, { force: true });
	if (images === null) return;
	fs.writeFileSync(
		file,
		`${JSON.stringify({ ...images, verdictSha256: digest(fs.readFileSync(verdictFile)) }, null, "\t")}\n`,
	);
}

/**
 * Captures verifiably supplied with one grader's verdict, still backed by the same bytes.
 * @param batchRoot The batch.
 * @param grader The grader.
 * @param run The anonymous run.
 * @returns The supplied labels; missing, historical, damaged or stale evidence proves nothing.
 */
function suppliedCaptures(batchRoot: string, grader: GraderName, run: string): string[] {
	const layout = graderLayout(batchRoot, grader);
	const verdict = path.join(layout.verdicts, `${run}.json`);
	try {
		const receipt = ReceiptSchema.parse(
			JSON.parse(fs.readFileSync(`${verdict}.images.json`, "utf8")),
		);
		if (receipt.run !== run || receipt.verdictSha256 !== digest(fs.readFileSync(verdict)))
			return [];
		const workspace = layout.workspace;
		if (
			receipt.images.some(
				(image) => digest(fs.readFileSync(path.join(workspace, image.file))) !== image.sha256,
			)
		)
			return [];
		return receipt.suppliedCaptures;
	} catch {
		return [];
	}
}

export { fileImageReceipt, imagesForRun, suppliedCaptures, type RunImages };
