import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import {
	FindingCodeSchema,
	InspectionReportSchema,
	type InspectionFinding,
	type InspectionReport,
} from "../../runtime/board-inspection/index.js";
import { findingRasterDimensions } from "../../shared/finding-raster/index.js";

const HEX_SHA256 = /^[0-9a-f]{64}$/;
const FILE_NAME = /^\d{4,}-[A-Z_]+-[0-9a-f]{12}\.png$/;

export const FindingRenderFailureSchema = z.enum([
	"focus-unavailable",
	"source-not-renderable",
	"browser-export-failed",
	"browser-timeout",
	"invalid-png",
]);
export type FindingRenderFailure = z.infer<typeof FindingRenderFailureSchema>;

const entryCommon = {
	findingIndex: z.number().int().nonnegative(),
	code: FindingCodeSchema,
	findingDigest: z.string().regex(HEX_SHA256),
};

export const RenderedFindingEntrySchema = z.strictObject({
	...entryCommon,
	status: z.literal("rendered"),
	file: z.string().regex(FILE_NAME),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	sha256: z.string().regex(HEX_SHA256),
});

export const FailedFindingEntrySchema = z.strictObject({
	...entryCommon,
	status: z.literal("failed"),
	failure: FindingRenderFailureSchema,
});

export const FindingRenderEntrySchema = z.discriminatedUnion("status", [
	RenderedFindingEntrySchema,
	FailedFindingEntrySchema,
]);

export const FindingRenderManifestSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		board: z.string().min(1),
		sourceFingerprint: z.string().regex(HEX_SHA256),
		report: InspectionReportSchema,
		complete: z.boolean(),
		entries: z.array(FindingRenderEntrySchema),
	})
	.superRefine((manifest, context) => {
		if (manifest.entries.length !== manifest.report.findings.length) {
			context.addIssue({
				code: "custom",
				path: ["entries"],
				message: "Manifest entries must correspond one-for-one with report findings.",
			});
		}
		for (const [index, entry] of manifest.entries.entries()) {
			const finding = manifest.report.findings[index];
			if (!finding) continue;
			const digest = findingDigest(finding);
			if (entry.findingIndex !== index)
				context.addIssue({
					code: "custom",
					path: ["entries", index, "findingIndex"],
					message: "Manifest finding indexes must preserve report order.",
				});
			if (entry.code !== finding.code)
				context.addIssue({
					code: "custom",
					path: ["entries", index, "code"],
					message: "Manifest entry code must match its report finding.",
				});
			if (entry.findingDigest !== digest)
				context.addIssue({
					code: "custom",
					path: ["entries", index, "findingDigest"],
					message: "Manifest finding digest must match its report finding.",
				});
			if (entry.status === "rendered") {
				if (entry.file !== findingFileName(index, finding))
					context.addIssue({
						code: "custom",
						path: ["entries", index, "file"],
						message: "Rendered file name must derive from report order, code, and digest.",
					});
				if (!finding.focusBBox) {
					context.addIssue({
						code: "custom",
						path: ["entries", index, "status"],
						message: "A finding without a focus box cannot have a rendered entry.",
					});
				} else {
					const dimensions = findingRasterDimensions(finding.focusBBox);
					if (entry.width !== dimensions.width || entry.height !== dimensions.height)
						context.addIssue({
							code: "custom",
							path: ["entries", index],
							message: "Rendered dimensions must follow the fixed finding raster policy.",
						});
				}
			}
		}
		if (manifest.complete !== manifest.entries.every((entry) => entry.status === "rendered"))
			context.addIssue({
				code: "custom",
				path: ["complete"],
				message: "Manifest complete must be true exactly when every finding rendered.",
			});
	});

export type FindingRenderManifest = z.infer<typeof FindingRenderManifestSchema>;

export interface BrowserFindingResult {
	findingIndex: number;
	data?: string;
	failure?: "browser-export-failed" | "browser-timeout";
}

export interface FindingRenderServerResult {
	board: string;
	sourceFingerprint: string;
	report: InspectionReport;
	sourceRenderable: boolean;
	results: readonly BrowserFindingResult[];
}

export interface FindingArtifactSet {
	path: string;
	encoding: "files";
	files: Array<{ name: string; content: Uint8Array }>;
	manifest: { name: "manifest.json"; content: string };
}

export function findingDigest(finding: InspectionFinding): string {
	return createHash("sha256").update(JSON.stringify(finding)).digest("hex");
}

export function findingFileName(index: number, finding: InspectionFinding): string {
	return `${String(index + 1).padStart(4, "0")}-${finding.code}-${findingDigest(finding).slice(0, 12)}.png`;
}

export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 24) return null;
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	if (!signature.every((value, index) => bytes[index] === value)) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(8) !== 13) return null;
	if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
	const width = view.getUint32(16);
	const height = view.getUint32(20);
	return width > 0 && height > 0 ? { width, height } : null;
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export function assembleFindingArtifacts(
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
		if (!finding.focusBBox)
			return { ...common, status: "failed" as const, failure: "focus-unavailable" as const };
		if (!server.sourceRenderable)
			return { ...common, status: "failed" as const, failure: "source-not-renderable" as const };
		const result = byIndex.get(findingIndex);
		if (!result || result.failure)
			return {
				...common,
				status: "failed" as const,
				failure: result?.failure ?? ("browser-timeout" as const),
			};
		if (typeof result.data !== "string")
			return { ...common, status: "failed" as const, failure: "browser-export-failed" as const };
		const bytes = Uint8Array.from(Buffer.from(result.data, "base64"));
		const dimensions = readPngDimensions(bytes);
		const expected = findingRasterDimensions(finding.focusBBox);
		if (!dimensions || dimensions.width !== expected.width || dimensions.height !== expected.height)
			return { ...common, status: "failed" as const, failure: "invalid-png" as const };
		const file = findingFileName(findingIndex, finding);
		files.push({ name: file, content: bytes });
		return {
			...common,
			status: "rendered" as const,
			file,
			width: dimensions.width,
			height: dimensions.height,
			sha256: sha256(bytes),
		};
	});
	const manifest = FindingRenderManifestSchema.parse({
		schemaVersion: 1,
		board: server.board,
		sourceFingerprint: server.sourceFingerprint,
		report: server.report,
		complete: entries.every((entry) => entry.status === "rendered"),
		entries,
	});
	const content = JSON.stringify(manifest, null, 2) + "\n";
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
