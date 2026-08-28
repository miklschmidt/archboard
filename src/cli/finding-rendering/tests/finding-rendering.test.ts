import { describe, expect, test } from "bun:test";

import { inspectBoard } from "../../../runtime/board-inspection/index.js";
import { findingRasterDimensions } from "../../../shared/finding-raster/index.js";
import {
	assembleFindingArtifacts,
	findingDigest,
	findingFileName,
	FindingRenderManifestSchema,
	readPngDimensions,
} from "../index.js";

const report = inspectBoard([
	{ id: "bad", type: "rectangle", x: 10, y: 20, width: null, height: 40 },
]);
const finding = report.findings[0]!;

function png(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	const view = new DataView(bytes.buffer);
	view.setUint32(8, 13);
	bytes.set([73, 72, 68, 82], 12);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

describe("finding rendering", () => {
	test("fixed dimensions cap the longest edge and stay positive", () => {
		expect(findingRasterDimensions({ x: 0, y: 0, width: 64, height: 32 })).toEqual({
			width: 256,
			height: 128,
			scale: 4,
		});
		expect(findingRasterDimensions({ x: 0, y: 0, width: 2048, height: 0.25 })).toEqual({
			width: 1024,
			height: 1,
			scale: 0.5,
		});
	});

	test("finding digests and names are stable and ordered", () => {
		expect(findingDigest(finding)).toMatch(/^[0-9a-f]{64}$/);
		expect(findingFileName(0, finding)).toBe(
			`0001-${finding.code}-${findingDigest(finding).slice(0, 12)}.png`,
		);
	});

	test("finding ordinals keep four digits as a minimum across 9,999 and 10,000 entries", () => {
		const findingCount = 10_000;
		const findings = Array.from({ length: findingCount }, () => finding);
		const manyFindingReport = {
			...report,
			counts: {
				bySeverity: { ...report.counts.bySeverity, error: findingCount },
				byCode: { ...report.counts.byCode, INVALID_RENDER_GEOMETRY: findingCount },
			},
			findings,
		};
		const bytes = png(128, 128);
		const data = Buffer.from(bytes).toString("base64");
		const results = findings.map((_, findingIndex) => ({ findingIndex, data }));
		const assembled = assembleFindingArtifacts(
			{
				board: "ordinal-boundary",
				sourceFingerprint: "9".repeat(64),
				report: manyFindingReport,
				sourceRenderable: true,
				results,
			},
			"/tmp/findings",
		);
		expect(assembled.manifest.entries).toHaveLength(findingCount);
		const entry9_999 = assembled.manifest.entries[9_998];
		const entry10_000 = assembled.manifest.entries[9_999];
		if (entry9_999?.status !== "rendered" || entry10_000?.status !== "rendered") {
			throw new Error("ordinal boundary fixtures must render");
		}
		expect(entry9_999.file).toBe(findingFileName(9_998, finding));
		expect(entry10_000.file).toBe(findingFileName(9_999, finding));
		expect(entry9_999.file).toStartWith("9999-");
		expect(entry10_000.file).toStartWith("10000-");
		expect(FindingRenderManifestSchema.parse(assembled.manifest)).toEqual(assembled.manifest);
	});

	test("PNG validation owns signature, IHDR, and positive dimensions", () => {
		expect(readPngDimensions(png(32, 64))).toEqual({ width: 32, height: 64 });
		expect(readPngDimensions(new Uint8Array(24))).toBeNull();
		expect(readPngDimensions(png(0, 64))).toBeNull();
	});

	test("assembly validates bytes and emits one ordered manifest entry", () => {
		const dimensions = findingRasterDimensions(finding.focusBBox!);
		const bytes = png(dimensions.width, dimensions.height);
		const assembled = assembleFindingArtifacts(
			{
				board: "payments",
				sourceFingerprint: "a".repeat(64),
				report,
				sourceRenderable: true,
				results: [{ findingIndex: 0, data: Buffer.from(bytes).toString("base64") }],
			},
			"/tmp/findings",
		);
		expect(assembled.manifest.complete).toBeTrue();
		expect(assembled.manifest.entries[0]?.status).toBe("rendered");
		expect(assembled.artifact.files).toHaveLength(1);
		expect(assembled.artifact.manifest.content.endsWith("\n")).toBeTrue();
		expect(FindingRenderManifestSchema.parse(assembled.manifest)).toEqual(assembled.manifest);
	});

	test("invalid PNG and unrenderable sources stay truthful", () => {
		const base = {
			board: "payments",
			sourceFingerprint: "b".repeat(64),
			report,
		};
		const invalid = assembleFindingArtifacts(
			{
				...base,
				sourceRenderable: true,
				results: [{ findingIndex: 0, data: Buffer.from("not png").toString("base64") }],
			},
			"/tmp/findings",
		);
		expect(invalid.manifest.entries[0]).toMatchObject({
			status: "failed",
			failure: "invalid-png",
		});
		expect(invalid.artifact.files).toHaveLength(0);
		const unrenderable = assembleFindingArtifacts(
			{ ...base, sourceRenderable: false, results: [] },
			"/tmp/findings",
		);
		expect(unrenderable.manifest.entries[0]).toMatchObject({
			status: "failed",
			failure: "source-not-renderable",
		});
	});

	test("browser failures and missing callbacks produce an ordered partial manifest", () => {
		const twoFindingReport = inspectBoard([
			{ id: "one", type: "rectangle", x: 10, y: 20, width: null, height: 40 },
			{ id: "two", type: "rectangle", x: 200, y: 20, width: null, height: 40 },
		]);
		const assembled = assembleFindingArtifacts(
			{
				board: "payments",
				sourceFingerprint: "d".repeat(64),
				report: twoFindingReport,
				sourceRenderable: true,
				results: [{ findingIndex: 0, failure: "browser-export-failed" }],
			},
			"/tmp/findings",
		);
		expect(assembled.manifest.complete).toBeFalse();
		expect(
			assembled.manifest.entries.map((entry) => entry.status === "failed" && entry.failure),
		).toEqual(["browser-export-failed", "browser-timeout"]);
		expect(assembled.artifact.files).toHaveLength(0);
	});

	test("the public schema rejects reordered or mismatched entries", () => {
		const common = {
			findingIndex: 1,
			code: finding.code,
			findingDigest: findingDigest(finding),
			status: "failed" as const,
			failure: "source-not-renderable" as const,
		};
		expect(
			FindingRenderManifestSchema.safeParse({
				schemaVersion: 1,
				board: "payments",
				sourceFingerprint: "c".repeat(64),
				report,
				complete: false,
				entries: [common],
			}).success,
		).toBeFalse();
		const dimensions = findingRasterDimensions(finding.focusBBox!);
		const rendered = {
			...common,
			findingIndex: 0,
			status: "rendered" as const,
			file: findingFileName(0, finding),
			width: dimensions.width,
			height: dimensions.height,
			sha256: "e".repeat(64),
		};
		for (const mutation of [
			{ ...rendered, file: `0001-${finding.code}-${"0".repeat(12)}.png` },
			{ ...rendered, width: dimensions.width + 1 },
		]) {
			expect(
				FindingRenderManifestSchema.safeParse({
					schemaVersion: 1,
					board: "payments",
					sourceFingerprint: "c".repeat(64),
					report,
					complete: true,
					entries: [mutation],
				}).success,
			).toBeFalse();
		}
	});
});
