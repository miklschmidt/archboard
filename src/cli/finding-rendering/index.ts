import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import { FindingCodeSchema, InspectionReportSchema } from "@/runtime/board-inspection/index";
import type { InspectionFinding, InspectionReport } from "@/runtime/board-inspection/index";
import { findingRasterDimensions } from "@/shared/finding-raster/index";

const HEX_SHA256 = /^[0-9a-f]{64}$/u;
const FILE_NAME = /^\d{4,}-[A-Z_]+-[0-9a-f]{12}\.png$/u;

const FindingRenderFailureSchema = z.enum([
	"focus-unavailable",
	"source-not-renderable",
	"renderer-failed",
	"invalid-png",
]);
type FindingRenderFailure = z.infer<typeof FindingRenderFailureSchema>;

const entryCommon = {
	findingIndex: z.number().int().nonnegative(),
	code: FindingCodeSchema,
	findingDigest: z.string().regex(HEX_SHA256),
};

const RenderedFindingEntrySchema = z.strictObject({
	...entryCommon,
	status: z.literal("rendered"),
	file: z.string().regex(FILE_NAME),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	sha256: z.string().regex(HEX_SHA256),
});

const FailedFindingEntrySchema = z.strictObject({
	...entryCommon,
	status: z.literal("failed"),
	failure: FindingRenderFailureSchema,
});

const FindingRenderEntrySchema = z.discriminatedUnion("status", [
	RenderedFindingEntrySchema,
	FailedFindingEntrySchema,
]);
type FindingRenderEntry = z.infer<typeof FindingRenderEntrySchema>;
type RenderedFindingEntry = z.infer<typeof RenderedFindingEntrySchema>;

/**
 * Checks that a rendered entry names the file its finding decides and carries
 * the dimensions the fixed raster policy gives that finding's focus box.
 * @param entry - The rendered manifest entry.
 * @param finding - The report finding it stands for.
 * @param index - The finding's position in the report.
 * @param context - Where issues are recorded.
 */
function checkRenderedEntry(
	entry: RenderedFindingEntry,
	finding: InspectionFinding,
	index: number,
	context: z.RefinementCtx,
): void {
	if (entry.file !== findingFileName(index, finding)) {
		context.addIssue({
			code: "custom",
			path: ["entries", index, "file"],
			message: "Rendered file name must derive from report order, code, and digest.",
		});
	}
	if (!finding.focusBBox) {
		context.addIssue({
			code: "custom",
			path: ["entries", index, "status"],
			message: "A finding without a focus box cannot have a rendered entry.",
		});
		return;
	}
	const dimensions = findingRasterDimensions(finding.focusBBox);
	if (entry.width !== dimensions.width || entry.height !== dimensions.height) {
		context.addIssue({
			code: "custom",
			path: ["entries", index],
			message: "Rendered dimensions must follow the fixed finding raster policy.",
		});
	}
}

/**
 * Checks that one entry stands for the finding at its own position: the same
 * index, the same code, and the digest of that exact finding.
 * @param entry - The manifest entry.
 * @param finding - The report finding it stands for.
 * @param index - The finding's position in the report.
 * @param context - Where issues are recorded.
 */
function checkEntryAgainstFinding(
	entry: FindingRenderEntry,
	finding: InspectionFinding,
	index: number,
	context: z.RefinementCtx,
): void {
	if (entry.findingIndex !== index) {
		context.addIssue({
			code: "custom",
			path: ["entries", index, "findingIndex"],
			message: "Manifest finding indexes must preserve report order.",
		});
	}
	if (entry.code !== finding.code) {
		context.addIssue({
			code: "custom",
			path: ["entries", index, "code"],
			message: "Manifest entry code must match its report finding.",
		});
	}
	if (entry.findingDigest !== findingDigest(finding)) {
		context.addIssue({
			code: "custom",
			path: ["entries", index, "findingDigest"],
			message: "Manifest finding digest must match its report finding.",
		});
	}
	if (entry.status === "rendered") {
		checkRenderedEntry(entry, finding, index, context);
	}
}

/** The manifest fields that must agree with the report, as parsed so far. */
interface ManifestUnderCheck {
	readonly entries: readonly FindingRenderEntry[];
	readonly report: InspectionReport;
	readonly complete: boolean;
}

/**
 * Checks a manifest against the report it accompanies: one entry per finding
 * in report order, each entry naming the finding it stands for, and the
 * complete flag agreeing with the entries. The manifest is the only record of
 * which PNG belongs to which finding, so none of it may drift.
 * @param manifest - The parsed manifest.
 * @param context - Where issues are recorded.
 */
function checkManifestAgainstReport(manifest: ManifestUnderCheck, context: z.RefinementCtx): void {
	if (manifest.entries.length !== manifest.report.findings.length) {
		context.addIssue({
			code: "custom",
			path: ["entries"],
			message: "Manifest entries must correspond one-for-one with report findings.",
		});
	}
	for (const [index, entry] of manifest.entries.entries()) {
		const finding = manifest.report.findings[index];
		if (finding) {
			checkEntryAgainstFinding(entry, finding, index, context);
		}
	}
	if (manifest.complete !== manifest.entries.every((entry) => entry.status === "rendered")) {
		context.addIssue({
			code: "custom",
			path: ["complete"],
			message: "Manifest complete must be true exactly when every finding rendered.",
		});
	}
}

const FindingRenderManifestSchema = z
	.strictObject({
		schemaVersion: z.literal(3),
		board: z.string().min(1),
		sourceFingerprint: z.string().regex(HEX_SHA256),
		report: InspectionReportSchema,
		complete: z.boolean(),
		entries: z.array(FindingRenderEntrySchema),
	})
	.superRefine(checkManifestAgainstReport);

type FindingRenderManifest = z.infer<typeof FindingRenderManifestSchema>;

interface RendererFindingResult {
	findingIndex: number;
	data?: string;
	failure?: "renderer-failed";
}

interface FindingRenderServerResult {
	board: string;
	sourceFingerprint: string;
	report: InspectionReport;
	sourceRenderable: boolean;
	results: readonly RendererFindingResult[];
}

interface FindingArtifactSet {
	path: string;
	encoding: "files";
	files: { name: string; content: Uint8Array }[];
	manifest: { name: "manifest.json"; content: string };
}

/**
 * The digest of one finding, which is what makes a rendered file name specific
 * to the finding it depicts rather than to its position in the report.
 * @param finding - The finding to digest.
 * @returns The SHA-256 of the finding's canonical JSON, in hexadecimal.
 */
function findingDigest(finding: InspectionFinding): string {
	return createHash("sha256").update(JSON.stringify(finding)).digest("hex");
}

/**
 * The file name a finding's PNG must have: its position in the report, its
 * code, and enough of its digest to tell two findings of the same code apart.
 * @param index - The finding's position in the report.
 * @param finding - The finding.
 * @returns The file name.
 */
function findingFileName(index: number, finding: InspectionFinding): string {
	return `${String(index + 1).padStart(4, "0")}-${finding.code}-${findingDigest(finding).slice(0, 12)}.png`;
}

/** A rendered finding's pixel size. */
interface RasterDimensions {
	width: number;
	height: number;
}

/** The eight bytes every PNG begins with. */
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Tells whether bytes begin with a PNG signature followed by a 13-byte IHDR
 * chunk, which is where the dimensions live.
 * @param bytes - The candidate PNG.
 * @param view - A view over the same bytes.
 * @returns True when the header is where the dimensions can be read from.
 */
function hasPngHeader(bytes: Uint8Array, view: DataView): boolean {
	return (
		PNG_SIGNATURE.every((value, index) => bytes[index] === value) &&
		view.getUint32(8) === 13 &&
		String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"
	);
}

/**
 * Reads a PNG's dimensions from its header, which is how a rendered finding is
 * checked against the size the raster policy required without decoding it.
 * @param bytes - The candidate PNG.
 * @returns The dimensions, or null when the bytes are not a PNG with a usable size.
 */
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 24) {
		return null;
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (!hasPngHeader(bytes, view)) {
		return null;
	}
	const width = view.getUint32(16);
	const height = view.getUint32(20);
	return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The digest recorded for a rendered file, so a manifest reader can tell the
 * bytes have not changed since they were written.
 * @param bytes - The file's bytes.
 * @returns The SHA-256 in hexadecimal.
 */
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** What one finding's render produced: its PNG bytes, or why there are none. */
type FindingEntryOutcome =
	| { readonly failure: FindingRenderFailure }
	| { readonly bytes: Uint8Array; readonly width: number; readonly height: number };

/**
 * Decides what became of one finding: no focus box to render, a source the
 * renderer could not draw, a render that failed, or PNG bytes that must match
 * the size the fixed raster policy gives this finding's focus box.
 * @param finding - The finding.
 * @param result - What the renderer returned for it, if anything.
 * @param sourceRenderable - Whether the board could be rendered at all.
 * @returns The bytes and their dimensions, or the failure to record.
 */
function findingEntryOutcome(
	finding: InspectionFinding,
	result: RendererFindingResult | undefined,
	sourceRenderable: boolean,
): FindingEntryOutcome {
	if (!finding.focusBBox) {
		return { failure: "focus-unavailable" };
	}
	if (!sourceRenderable) {
		return { failure: "source-not-renderable" };
	}
	const bytes = decodedRender(result);
	if (bytes === null) {
		return { failure: renderFailure(result) };
	}
	const dimensions = readPngDimensions(bytes);
	if (!matchesExpectedRaster(dimensions, findingRasterDimensions(finding.focusBBox))) {
		return { failure: "invalid-png" };
	}
	return { bytes, width: dimensions.width, height: dimensions.height };
}

/**
 * Names why a finding has no bytes: the renderer's own reason when it gave
 * one, and otherwise that the render simply did not arrive.
 * @param result - The renderer's result, absent when it sent none.
 * @returns The failure to record.
 */
function renderFailure(result: RendererFindingResult | undefined): FindingRenderFailure {
	return result?.failure ?? "renderer-failed";
}

/**
 * Decodes what the renderer sent back for one finding.
 * @param result - The renderer's result, absent when it sent none.
 * @returns The PNG bytes, or null when there are none to decode.
 */
function decodedRender(result: RendererFindingResult | undefined): Uint8Array | null {
	if (!result || result.failure || typeof result.data !== "string") {
		return null;
	}
	return Uint8Array.from(Buffer.from(result.data, "base64"));
}

/**
 * Tells whether a PNG is exactly the size the fixed raster policy required for
 * its finding, which is what makes the manifest's dimensions trustworthy.
 * @param dimensions - The dimensions read from the PNG, or null when it is not a PNG.
 * @param expected - The dimensions the policy gives this finding's focus box.
 * @returns True when they match exactly.
 */
function matchesExpectedRaster(
	dimensions: RasterDimensions | null,
	expected: RasterDimensions,
): dimensions is RasterDimensions {
	return (
		dimensions !== null &&
		dimensions.width === expected.width &&
		dimensions.height === expected.height
	);
}

/**
 * Assembles the ordered file set and manifest for one render: one entry per
 * report finding, and a file for every finding that rendered. The manifest is
 * validated against the report before it is written.
 * @param server - What the server rendered, and the report it rendered from.
 * @param outDirectory - Where the file set will be committed.
 * @returns The manifest and the artifact to commit.
 */
function assembleFindingArtifacts(
	server: FindingRenderServerResult,
	outDirectory: string,
): { manifest: FindingRenderManifest; artifact: FindingArtifactSet } {
	const byIndex = new Map(server.results.map((result) => [result.findingIndex, result]));
	const files: FindingArtifactSet["files"] = [];
	const entries = server.report.findings.map((finding, findingIndex) => {
		const common = {
			findingIndex,
			code: finding.code,
			findingDigest: findingDigest(finding),
		};
		const outcome = findingEntryOutcome(
			finding,
			byIndex.get(findingIndex),
			server.sourceRenderable,
		);
		if ("failure" in outcome) {
			return { ...common, status: "failed" as const, failure: outcome.failure };
		}
		const file = findingFileName(findingIndex, finding);
		files.push({ name: file, content: outcome.bytes });
		return {
			...common,
			status: "rendered" as const,
			file,
			width: outcome.width,
			height: outcome.height,
			sha256: sha256(outcome.bytes),
		};
	});
	const manifest = FindingRenderManifestSchema.parse({
		schemaVersion: 3,
		board: server.board,
		sourceFingerprint: server.sourceFingerprint,
		report: server.report,
		complete: entries.every((entry) => entry.status === "rendered"),
		entries,
	});
	const content = `${JSON.stringify(manifest, null, 2)}\n`;
	return {
		manifest,
		artifact: {
			path: path.resolve(outDirectory),
			encoding: "files",
			files,
			manifest: { name: "manifest.json", content },
		},
	};
}

export {
	FindingRenderFailureSchema,
	type FindingRenderFailure,
	RenderedFindingEntrySchema,
	FailedFindingEntrySchema,
	FindingRenderEntrySchema,
	FindingRenderManifestSchema,
	type FindingRenderManifest,
	type RendererFindingResult,
	type FindingRenderServerResult,
	type FindingArtifactSet,
	findingDigest,
	findingFileName,
	readPngDimensions,
	assembleFindingArtifacts,
};
