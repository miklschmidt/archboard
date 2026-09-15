import { describe, expect, test } from "bun:test";
import {
	CAPTURE_TILE_SIDE_PX,
	captureFromReceipt,
	captureSummary,
	tileRegions,
	visualStandingOf,
	type CaptureAttempt,
	type CaptureDeclaration,
	type RunVerdict,
} from "@/runtime/skill-evaluation/index";

// The harness's own record of the pictures: what one rasterize answer amounts
// to, when a large capture is cut into tiles, and how the grader's visual
// verdict stands once the harness's record of the captures is counted. The
// rasterizer itself is proved by its own owner; nothing here draws.

const DECLARED: CaptureDeclaration = {
	label: "exchange",
	board: "Flask request pipeline",
	view: "Dispatch exchange",
	grammar: "data-flow",
};

/**
 * A rasterize receipt, as the CLI answers it.
 * @param overrides What differs from a native capture of the declared view.
 * @returns The receipt.
 */
function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		success: true,
		board: "Flask request pipeline",
		version: 4,
		variant: { id: "v1", name: "Current", lifecycle: "current" },
		view: { id: "w1", name: "Dispatch exchange", grammar: "data-flow" },
		theme: "light",
		file: "/run/captures/capture-0-exchange.png",
		width: 900,
		height: 420,
		scale: 1,
		diagram: { width: 900, height: 420 },
		region: null,
		source: {
			renderer: "semantic-renderer",
			fonts: "embedded",
			svgSha256: "ab".repeat(32),
			facesLoaded: 4,
			motion: "paused-at-start",
		},
		...overrides,
	};
}

/** A command answer that succeeded with the given receipt. */
const answered = (json: unknown) => ({ exitCode: 0, json, stdout: "", stderr: "" });

describe("what one capture record is", () => {
	test("a native receipt of the declared view is a capture with its provenance", () => {
		const attempt = captureFromReceipt(DECLARED, answered(receipt()), import.meta.path);
		expect(attempt.ok).toBe(true);
		expect(attempt.file).toBe(import.meta.path);
		expect(attempt.provenance).toMatchObject({
			version: 4,
			variant: { id: "v1", name: "Current" },
			view: { name: "Dispatch exchange", grammar: "data-flow" },
			scale: 1,
			width: 900,
			height: 420,
			svgSha256: "ab".repeat(32),
			motion: "paused-at-start",
		});
	});

	test("a default view in place of the declared one, or the wrong grammar, is a failed capture", () => {
		const whole = captureFromReceipt(DECLARED, answered(receipt({ view: null })), import.meta.path);
		expect(whole).toMatchObject({ ok: false, tiles: [] });
		expect(whole.file).toBeUndefined();
		expect(whole.provenance).toBeUndefined();
		const architecture = captureFromReceipt(
			DECLARED,
			answered(receipt({ view: { id: "w1", name: "Dispatch exchange", grammar: "architecture" } })),
			import.meta.path,
		);
		expect(architecture).toMatchObject({ ok: false, tiles: [] });
		expect(architecture.file).toBeUndefined();
		expect(architecture.provenance).toBeUndefined();
	});

	test("a refusal, a missing receipt, a scaled capture or an absent file is recorded as not taken", () => {
		const refused = captureFromReceipt(
			DECLARED,
			{
				exitCode: 1,
				json: null,
				stdout: "",
				stderr: 'Error: view "Dispatch exchange" is not on the board\n',
			},
			import.meta.path,
		);
		expect(refused).toMatchObject({ ok: false, tiles: [] });
		expect(refused.file).toBeUndefined();
		expect(refused.provenance).toBeUndefined();
		expect(captureFromReceipt(DECLARED, answered({ nonsense: true }), import.meta.path).ok).toBe(
			false,
		);
		expect(captureFromReceipt(DECLARED, answered(receipt({ scale: 2 })), import.meta.path).ok).toBe(
			false,
		);
		const gone = captureFromReceipt(DECLARED, answered(receipt()), "/nowhere/capture.png");
		expect(gone).toMatchObject({ ok: false, tiles: [] });
		expect(gone.file).toBeUndefined();
		expect(gone.provenance).toBeUndefined();
	});

	test("the manifest summary names what was declared, taken and not", () => {
		const taken: CaptureAttempt = { ...DECLARED, ok: true, detail: "captured", tiles: [] };
		const missed: CaptureAttempt = {
			label: "overview",
			board: "Flask",
			ok: false,
			detail: "rasterize failed",
			tiles: [],
		};
		expect(captureSummary([taken, missed])).toEqual({
			declared: ["exchange", "overview"],
			captured: ["exchange"],
			failed: ["overview"],
		});
	});
});

describe("native-scale tiles", () => {
	test("a capture within the side needs none; a larger one is cut into a grid that covers it exactly", () => {
		expect(tileRegions(CAPTURE_TILE_SIDE_PX, CAPTURE_TILE_SIDE_PX, CAPTURE_TILE_SIDE_PX)).toEqual(
			[],
		);
		const tiles = tileRegions(3500, 1700, 1600);
		expect(tiles).toHaveLength(6);
		expect(tiles[0]).toEqual({ x: 0, y: 0, width: 1600, height: 1600 });
		expect(tiles[2]).toEqual({ x: 3200, y: 0, width: 300, height: 1600 });
		expect(tiles[5]).toEqual({ x: 3200, y: 1600, width: 300, height: 100 });
		const area = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
		expect(area).toBe(3500 * 1700);
	});
});

/**
 * A filed verdict with the given visual answer, or none.
 * @param visual What the grader said it saw.
 * @returns The verdict.
 */
function graded(visual: RunVerdict["visual"]): RunVerdict {
	return {
		run: "run-0123456789",
		features: [],
		semanticCorrectness: 8,
		architecturalTruth: 8,
		readability: 8,
		summary: "fine",
		concerns: [],
		...(visual === undefined ? {} : { visual }),
	};
}

describe("the visual verdict as it stands", () => {
	const taken = { declared: ["a", "b"], captured: ["a", "b"], failed: [] };

	test("a pass stands only when every declared capture was taken and every taken one was opened", () => {
		const looked = {
			inspectedCaptures: ["a", "b"],
			verdict: "pass" as const,
			observations: ["a", "b"].map((capture) => ({ capture, observation: "legible" })),
		};
		expect(visualStandingOf(taken, graded(looked), ["a", "b"])).toBe("pass");
		expect(visualStandingOf(taken, graded(looked))).toBe("incomplete");
		expect(
			visualStandingOf(
				taken,
				graded({ ...looked, observations: looked.observations.slice(0, 1) }),
				["a", "b"],
			),
		).toBe("incomplete");
		expect(visualStandingOf({ ...taken, captured: ["a"] }, graded(looked), ["a", "b"])).toBe(
			"incomplete",
		);
		expect(visualStandingOf(taken, graded({ ...looked, inspectedCaptures: ["a"] }))).toBe(
			"incomplete",
		);
		expect(
			visualStandingOf({ declared: ["a", "b"], captured: ["a"], failed: ["b"] }, graded(looked)),
		).toBe("incomplete");
		expect(visualStandingOf({ declared: ["a"], captured: [], failed: ["a"] }, graded(looked))).toBe(
			"incomplete",
		);
		expect(visualStandingOf(null, graded(looked))).toBe("incomplete");
	});

	test("a grader that names the files it opened is read as naming their captures", () => {
		const byFile = {
			inspectedCaptures: [
				"captures/capture-0-a.png",
				"captures/capture-0-a-tile-0.png",
				"runs/run-0123456789/captures/capture-1-b.png",
			],
			verdict: "pass" as const,
			observations: [
				{ capture: "captures/capture-0-a.png", observation: "legible" },
				{ capture: "captures/capture-1-b.png", observation: "legible" },
			],
		};
		expect(visualStandingOf(taken, graded(byFile), ["a", "b"])).toBe("pass");
		expect(visualStandingOf(taken, graded({ ...byFile, verdict: "fail" }), ["a", "b"])).toBe(
			"fail",
		);
		const unknown = { ...byFile, observations: [byFile.observations[0]!] };
		expect(visualStandingOf(taken, graded(unknown), ["a", "b"])).toBe("incomplete");
		const other = {
			...byFile,
			inspectedCaptures: ["captures/capture-0-a.png", "captures/capture-1-c.png"],
		};
		expect(visualStandingOf(taken, graded(other), ["a", "b"])).toBe("incomplete");
	});

	test("pass and fail require complete delivery and observations; historical or partial evidence stays incomplete", () => {
		const failed = {
			inspectedCaptures: ["a", "b"],
			verdict: "fail" as const,
			observations: ["a", "b"].map((capture) => ({ capture, observation: "clipped" })),
		};
		expect(visualStandingOf(taken, graded(failed), ["a", "b"])).toBe("fail");
		expect(visualStandingOf(taken, graded(failed))).toBe("incomplete");
		expect(
			visualStandingOf({ declared: ["a", "b"], captured: ["a"], failed: ["b"] }, graded(failed), [
				"a",
			]),
		).toBe("incomplete");
		expect(
			visualStandingOf(taken, graded({ ...failed, observations: "historical prose" }), ["a", "b"]),
		).toBe("incomplete");
		expect(visualStandingOf(taken, graded({ ...failed, verdict: "incomplete" }), ["a", "b"])).toBe(
			"incomplete",
		);
		expect(visualStandingOf(taken, graded(undefined))).toBe("incomplete");
		expect(visualStandingOf(taken, null)).toBeNull();
	});
});
