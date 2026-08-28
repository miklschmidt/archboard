import { describe, expect, test } from "bun:test";
import { InspectionReportSchema, inspectBoard } from "../index.js";
import { connector, semanticNode, type RawElement } from "./fixtures/elements.js";

describe("binding reference matrices", () => {
	test("maps every start and end binding issue to its exact classification semantics", () => {
		const complete = { elementId: "node", focus: 0, gap: 0 };
		const cases = [
			["not-object", "bad", true],
			["array", [], true],
			["missing-element-id", { focus: 0, gap: 0 }, true],
			["empty-element-id", { elementId: "", focus: 0, gap: 0 }, true],
			["non-string-element-id", { elementId: 1, focus: 0, gap: 0 }, true],
			["missing-focus", { elementId: "node", gap: 0 }, false],
			["nonfinite-focus", { elementId: "node", focus: "bad", gap: 0 }, false],
			["missing-gap", { elementId: "node", focus: 0 }, false],
			["nonfinite-gap", { elementId: "node", focus: 0, gap: null }, false],
			["invalid-fixed-point", { ...complete, fixedPoint: [0] }, false],
		] as const;
		for (const end of ["start", "end"] as const)
			for (const [issue, value, classificationBlocked] of cases) {
				const report = inspectBoard([
					connector({
						[`${end}Binding`]: value,
						points: [
							[0, 0],
							[10, 0],
						],
					}),
				]);
				const finding = report.findings.find(
					(candidate) =>
						candidate.code === "BROKEN_REFERENCE" &&
						candidate.reason === `malformed-${end}-binding`,
				);
				expect(InspectionReportSchema.safeParse(report).success).toBe(true);
				expect(finding && "issue" in finding.details ? finding.details.issue : null).toBe(issue);
				expect(
					finding && "classificationBlocked" in finding.details
						? finding.details.classificationBlocked
						: null,
				).toBe(classificationBlocked);
				expect(finding?.affectsCoverage).toBe(classificationBlocked);
			}
	});

	test("keeps undefined and null bindings canonical", () => {
		for (const startBinding of [undefined, null]) {
			const report = inspectBoard([connector({ startBinding })]);
			expect(report.findings.some((finding) => finding.reason === "malformed-start-binding")).toBe(
				false,
			);
		}
	});

	test("blocks node penetration for all fifteen malformed endpoint combinations", () => {
		const bindings = [
			["not-object", "bad"],
			["array", []],
			["missing-element-id", { focus: 0, gap: 0 }],
			["empty-element-id", { elementId: "", focus: 0, gap: 0 }],
			["non-string-element-id", { elementId: 1, focus: 0, gap: 0 }],
		] as const;
		const endpointSets = [["start"], ["end"], ["start", "end"]] as const;
		for (const [issue, value] of bindings)
			for (const ends of endpointSets) {
				const id = `blocked-${issue}-${ends.join("-")}`;
				const endpointBindings = Object.fromEntries(ends.map((end) => [`${end}Binding`, value]));
				const report = inspectBoard([
					semanticNode(`candidate-${issue}-${ends.join("-")}`, { x: 40, y: 0 }),
					connector({ id, y: 5, ...endpointBindings }),
				]);
				expect(report.coverage).toBe("indeterminate");
				for (const end of ends)
					expect(
						report.findings.some(
							(finding) =>
								finding.code === "BROKEN_REFERENCE" &&
								finding.reason === `malformed-${end}-binding` &&
								"issue" in finding.details &&
								"classificationBlocked" in finding.details &&
								finding.details.issue === issue &&
								finding.details.classificationBlocked &&
								finding.affectsCoverage,
						),
					).toBe(true);
				expect(
					report.findings.some(
						(finding) =>
							finding.code === "CONNECTOR_PENETRATES_NODE" && finding.details.connectorId === id,
					),
				).toBe(false);
			}
	});

	test("maps all seven malformed boundElements forms", () => {
		const cases = [
			["not-array", "bad", "not-array"],
			["entry-not-object", [null], "entry-not-object"],
			["missing-id", [{ type: "text" }], "missing-id"],
			["empty-id", [{ id: "", type: "text" }], "empty-id"],
			["non-string-id", [{ id: 1, type: "text" }], "non-string-id"],
			["missing-type", [{ id: "label" }], "missing-type"],
			["invalid-type", [{ id: "label", type: "image" }], "invalid-type"],
		] as const;
		for (const [label, boundElements, issue] of cases) {
			const report = inspectBoard([semanticNode(`node-${label}`, { boundElements })]);
			const finding = report.findings.find(
				(candidate) =>
					candidate.code === "BROKEN_REFERENCE" && candidate.reason === "malformed-bound-elements",
			);
			expect(report.coverage).toBe("indeterminate");
			expect(finding && "issue" in finding.details ? finding.details.issue : null).toBe(issue);
			expect(
				finding && "classificationBlocked" in finding.details
					? finding.details.classificationBlocked
					: null,
			).toBe(true);
			expect(finding?.affectsCoverage).toBe(true);
		}
	});

	test("validates all eight declared and actual bound target type pairs", () => {
		const cases = [
			["text-to-text", "text", "text", false],
			["text-to-arrow", "text", "arrow", true],
			["text-to-line", "text", "line", true],
			["text-to-rectangle", "text", "rectangle", true],
			["arrow-to-text", "arrow", "text", true],
			["arrow-to-arrow", "arrow", "arrow", false],
			["arrow-to-line", "arrow", "line", false],
			["arrow-to-rectangle", "arrow", "rectangle", true],
		] as const;
		for (const [label, declaredType, actualType, mismatch] of cases) {
			const targetId = `target-${label}`;
			const ownerId = `owner-${label}`;
			let target: RawElement;
			if (actualType === "text")
				target = {
					id: targetId,
					type: "text",
					x: 40,
					y: 0,
					width: 10,
					height: 10,
					fontFamily: 5,
					text: "target",
				};
			else if (actualType === "arrow" || actualType === "line")
				target = connector({
					id: targetId,
					type: actualType,
					x: 40,
					width: 10,
					points: [
						[0, 0],
						[10, 0],
					],
					...(label === "arrow-to-line"
						? { startBinding: { elementId: ownerId, focus: 0, gap: 0 } }
						: {}),
				});
			else target = { id: targetId, type: "rectangle", x: 40, y: 0, width: 10, height: 10 };
			const report = inspectBoard([
				semanticNode(ownerId, { boundElements: [{ id: targetId, type: declaredType }] }),
				target,
			]);
			const finding = report.findings.find(
				(candidate) => candidate.reason === "bound-element-target-type-mismatch",
			);
			if (mismatch) {
				expect(finding?.affectsCoverage).toBe(true);
				expect(finding?.details).toMatchObject({ targetId, declaredType, actualType });
				expect(report.coverage).toBe("indeterminate");
			} else {
				expect(finding).toBeUndefined();
				if (label === "arrow-to-line")
					expect(
						report.findings.some((candidate) => candidate.reason === "missing-binding-reciprocal"),
					).toBe(false);
			}
		}
	});

	test("keeps four malformed actual target types indeterminate without false mismatch", () => {
		for (const [label, rawType] of [
			["missing", undefined],
			["null", null],
			["boolean", false],
			["unknown", "future-target"],
		] as const) {
			const target: RawElement = {
				id: `unknown-bound-${label}`,
				x: 40,
				y: 0,
				width: 10,
				height: 10,
			};
			if (label !== "missing") target.type = rawType;
			const report = inspectBoard([
				semanticNode(`unknown-owner-${label}`, {
					boundElements: [{ id: target.id, type: "text" }],
				}),
				target,
			]);
			expect(report.coverage).toBe("indeterminate");
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "UNSUPPORTED_GEOMETRY" &&
						finding.reason === "unsupported-type" &&
						finding.elements[0]?.id === target.id,
				),
			).toBe(true);
			expect(
				report.findings.some((finding) => finding.reason === "bound-element-target-type-mismatch"),
			).toBe(false);
		}
	});

	test("suppresses exact identity-dependent reasons for all six duplicate roles", () => {
		const cases: readonly (readonly [string, readonly RawElement[], readonly string[]])[] = [
			[
				"binding target",
				[
					semanticNode("duplicate-target-a", { id: "dup-target", x: 40 }),
					semanticNode("duplicate-target-b", { id: "dup-target", x: 70 }),
					connector({
						id: "target-edge",
						y: 5,
						startBinding: { elementId: "dup-target", focus: 0, gap: 0 },
					}),
				],
				["missing-binding-target", "invalid-binding-target-type", "leaf-footprint-interior"],
			],
			[
				"connector",
				[
					semanticNode("connector-candidate", { x: 40, y: 20 }),
					connector({ id: "dup-edge", y: 25 }),
					connector({ id: "dup-edge", y: 25 }),
				],
				["leaf-footprint-interior", "proper-interior-crossing", "collinear-overlap"],
			],
			[
				"semantic node member",
				[
					semanticNode("duplicate-node-a", { id: "dup-node", width: 100, height: 100 }),
					semanticNode("duplicate-node-b", {
						id: "dup-node",
						x: 20,
						y: 20,
						width: 100,
						height: 100,
					}),
					semanticNode("other-node", { x: 40, y: 40, width: 20, height: 20 }),
				],
				["leaf-footprint-overlap"],
			],
			[
				"label and container ownership",
				[
					semanticNode("owner-a", {
						id: "dup-owner",
						boundElements: [{ id: "dup-label", type: "text" }],
					}),
					semanticNode("owner-b", {
						id: "dup-owner",
						x: 100,
						boundElements: [{ id: "dup-label", type: "text" }],
					}),
					{
						id: "dup-label",
						type: "text",
						x: 35,
						y: 20,
						width: 30,
						height: 20,
						fontFamily: 5,
						text: "duplicate",
						containerId: "dup-owner",
					},
					{
						id: "dup-label",
						type: "text",
						x: 105,
						y: 20,
						width: 30,
						height: 20,
						fontFamily: 5,
						text: "duplicate",
						containerId: "dup-owner",
					},
					semanticNode("duplicate-unrelated", { x: 50, width: 100, height: 100 }),
				],
				["label-node-overlap", "label-label-overlap", "missing-reciprocal", "conflicting-owner"],
			],
			[
				"obstacle member",
				[
					{
						id: "dup-obstacle",
						type: "rectangle",
						x: 40,
						y: 0,
						width: 30,
						height: 30,
						groupIds: ["g"],
					},
					{
						id: "dup-obstacle",
						type: "rectangle",
						x: 40,
						y: 0,
						width: 30,
						height: 30,
						groupIds: ["g"],
					},
					{
						id: "other-obstacle",
						type: "rectangle",
						x: 70,
						y: 0,
						width: 30,
						height: 30,
						groupIds: ["g"],
					},
					connector({ id: "obstacle-edge", y: 15, width: 120 }),
				],
				["obstacle-footprint-interior"],
			],
			[
				"bound reference target",
				[
					semanticNode("reference-owner", {
						boundElements: [{ id: "dup-reference", type: "arrow" }],
					}),
					connector({ id: "dup-reference", x: 100 }),
					{
						id: "dup-reference",
						type: "rectangle",
						x: 120,
						y: 0,
						width: 10,
						height: 10,
					},
				],
				["dangling-bound-arrow", "bound-element-target-type-mismatch"],
			],
		];
		for (const [label, elements, forbiddenReasons] of cases) {
			const report = inspectBoard([...elements]);
			expect(InspectionReportSchema.safeParse(report).success).toBe(true);
			expect(report.coverage).toBe("indeterminate");
			expect(report.findings.some((finding) => finding.reason === "duplicate-element-id")).toBe(
				true,
			);
			const observedForbidden = report.findings
				.filter((finding) => forbiddenReasons.includes(finding.reason))
				.map((finding) => finding.reason);
			expect(observedForbidden, label).toEqual([]);
		}
	});
});
