import { describe, expect, test } from "bun:test";
import denseAfter from "./fixtures/dense-after.excalidraw.json" with { type: "json" };
import { InspectionReportSchema, inspectBoard } from "../index.js";

const deepFreeze = <T>(value: T): Readonly<T> => {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value)) deepFreeze(child);
	return Object.freeze(value);
};

describe("inspection input snapshot", () => {
	test("does not invoke accessors or proxy traps", () => {
		let hits = 0;
		const accessor = { id: "accessor", type: "rectangle", x: 0, y: 0, width: 1, height: 1 };
		Object.defineProperty(accessor, "customData", { enumerable: true, get: () => (hits += 1) });
		const proxy = new Proxy(
			{ id: "proxy", type: "rectangle", x: 0, y: 0, width: 1, height: 1 },
			{ get: () => (hits += 1), ownKeys: () => ((hits += 1), []) },
		);
		for (const input of [[accessor], [proxy]]) {
			const report = inspectBoard(input);
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(report.coverage).toBe("indeterminate");
			expect(report.findings.some((finding) => finding.reason === "non-data-input")).toBe(true);
		}
		expect(hits).toBe(0);
	});

	test("handles a revoked proxy as the root records array", () => {
		const revoked = Proxy.revocable<unknown[]>([], {});
		revoked.revoke();
		let report: ReturnType<typeof inspectBoard> | undefined;
		expect(() => {
			report = inspectBoard(revoked.proxy);
		}).not.toThrow();
		expect(InspectionReportSchema.safeParse(report).success).toBe(true);
		expect(report).toMatchObject({
			schemaVersion: 2,
			totalElementCount: 0,
			liveElementCount: 0,
			locatableElementCount: 0,
			broadPhaseComparisons: 0,
			coverage: "indeterminate",
			clean: false,
			maxSeverity: "error",
			coverageReasons: ["INVALID_RENDER_GEOMETRY/non-data-input"],
			findings: [
				{
					code: "INVALID_RENDER_GEOMETRY",
					reason: "non-data-input",
					severity: "error",
					affectsCoverage: true,
					message: "Inspection found non-data input at the input root $ (proxy).",
					elements: [],
					nodes: [],
					obstacles: [],
					points: [],
					affectedBBox: null,
					focusBBox: null,
					details: { sourceIndex: null, path: [], issue: "proxy" },
				},
			],
		});
	});

	test("handles revoked nested customData and a recognized record self-cycle", () => {
		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		const nested = {
			id: "proxy",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 1,
			height: 1,
			customData: revoked.proxy,
		};
		const cyclic: Record<string, unknown> = {
			id: "cycle",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 1,
			height: 1,
		};
		cyclic.customData = cyclic;
		for (const [record, issue] of [
			[nested, "proxy"],
			[cyclic, "active-path-cycle"],
		] as const) {
			const customData = record.customData;
			let report: ReturnType<typeof inspectBoard> | undefined;
			expect(() => {
				report = inspectBoard([record]);
			}).not.toThrow();
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(report).toMatchObject({
				totalElementCount: 1,
				coverage: "indeterminate",
				clean: false,
				coverageReasons: ["INVALID_RENDER_GEOMETRY/non-data-input"],
				findings: [
					{
						code: "INVALID_RENDER_GEOMETRY",
						reason: "non-data-input",
						severity: "error",
						affectsCoverage: true,
						elements: [{ id: record.id, type: "rectangle", sourceIndex: 0 }],
						points: [{ x: 0, y: 0 }],
						affectedBBox: { x: 0, y: 0, width: 1, height: 1 },
						focusBBox: { x: -16, y: -16, width: 33, height: 33 },
						details: { sourceIndex: 0, path: ["customData"], issue },
					},
				],
			});
			expect(record.customData).toBe(customData);
		}
		expect(cyclic.customData).toBe(cyclic);
	});

	test("handles unsafe customData on otherwise valid recognized records", () => {
		for (const [id, customData, issue] of [
			["function", () => 1, "function"],
			["symbol", Symbol("unsafe"), "symbol"],
			["bigint", 1n, "bigint"],
		] as const) {
			const record = { id, type: "rectangle", x: 0, y: 0, width: 1, height: 1, customData };
			let report: ReturnType<typeof inspectBoard> | undefined;
			expect(() => {
				report = inspectBoard([record]);
			}).not.toThrow();
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(report).toMatchObject({
				totalElementCount: 1,
				coverage: "indeterminate",
				clean: false,
				coverageReasons: ["INVALID_RENDER_GEOMETRY/non-data-input"],
				findings: [
					{
						code: "INVALID_RENDER_GEOMETRY",
						reason: "non-data-input",
						severity: "error",
						affectsCoverage: true,
						elements: [{ id, type: "rectangle", sourceIndex: 0 }],
						points: [{ x: 0, y: 0 }],
						affectedBBox: { x: 0, y: 0, width: 1, height: 1 },
						focusBBox: { x: -16, y: -16, width: 33, height: 33 },
						details: { sourceIndex: 0, path: ["customData"], issue },
					},
				],
			});
			expect(record.customData).toBe(customData);
		}
	});

	test("handles a custom-prototype record without caller mutation", () => {
		const custom = Object.create({ inherited: true }) as Record<string, unknown>;
		Object.assign(custom, { id: "custom", type: "rectangle", x: 0, y: 0, width: 1, height: 1 });
		const prototype = Object.getPrototypeOf(custom);
		const report = inspectBoard([custom]);
		expect(InspectionReportSchema.safeParse(report).success).toBe(true);
		expect(report.coverage).toBe("indeterminate");
		expect(report.findings).toContainEqual(
			expect.objectContaining({
				code: "INVALID_RENDER_GEOMETRY",
				reason: "non-data-input",
				details: { sourceIndex: 0, path: [], issue: "non-plain-object" },
			}),
		);
		expect(Object.getPrototypeOf(custom)).toBe(prototype);
	});

	test("counts sparse slots", () => {
		const holes: unknown[] = [];
		holes.length = 3;
		expect(inspectBoard(holes).totalElementCount).toBe(3);
		const sparse: unknown[] = [];
		sparse.length = 1_000_001;
		expect(inspectBoard(sparse).findings).toContainEqual(
			expect.objectContaining({
				reason: "input-complexity-ceiling",
				details: expect.objectContaining({ attempted: 1_000_001, unitKind: "record" }),
			}),
		);
	});

	test("does not mutate any depth of the complete frozen dense fixture", () => {
		const callerInput = structuredClone(denseAfter);
		expect(callerInput).not.toBe(denseAfter);
		const frozenInput = deepFreeze(callerInput);
		const beforeBytes = JSON.stringify(frozenInput);
		let first: ReturnType<typeof inspectBoard> | undefined;
		expect(() => {
			first = inspectBoard(frozenInput);
		}).not.toThrow();
		expect(InspectionReportSchema.safeParse(first).success).toBe(true);
		expect(JSON.stringify(frozenInput)).toBe(beforeBytes);

		const firstFindingMessage = first!.findings[0]?.message;
		const pristineDetails = structuredClone(first!.findings[0]!.details);
		(first!.findings[0]!.details as Record<string, unknown>).testMutation = true;
		first!.findings[0]!.message = "caller mutation";
		const second = inspectBoard(frozenInput);
		expect(second.findings[0]?.details).toEqual(pristineDetails);
		expect(second.findings[0]?.details).not.toHaveProperty("testMutation");
		expect(second.findings[0]?.message).toBe(firstFindingMessage);
		expect(JSON.stringify(frozenInput)).toBe(beforeBytes);
	});
});
