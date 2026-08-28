import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import {
	CheckResultSchema,
	type InspectionReport,
} from "../../../src/runtime/board-inspection/index.js";
import { connector, type PackageElement } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

const semanticNode = (id: string, overrides: PackageElement = {}): PackageElement => ({
	id,
	type: "rectangle",
	x: 0,
	y: 0,
	width: 10,
	height: 10,
	angle: 0,
	customData: { archboard: { node: id } },
	...overrides,
});

const findingUses = (finding: InspectionReport["findings"][number], id: string) =>
	finding.elements.some((element) => element.id === id) ||
	("connectorId" in finding.details && finding.details.connectorId === id) ||
	("firstConnectorId" in finding.details && finding.details.firstConnectorId === id) ||
	("secondConnectorId" in finding.details && finding.details.secondConnectorId === id);

describe("persisted package prerequisites", () => {
	test("preserves the complete prerequisite and evidence contract", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const targetPairs = [
				["b1", "text", "rectangle"],
				["b2", "text", "arrow"],
				["b3", "arrow", "text"],
				["b4", "arrow", "rectangle"],
				["b5", "text", "text"],
				["b6", "arrow", "arrow"],
				["b7", "text", "line"],
				["b8", "arrow", "line"],
			] as const;
			const targetElements = targetPairs.flatMap(
				([prefix, declaredType, actualType], index): PackageElement[] => {
					const targetId = `${prefix}t`;
					let target: PackageElement;
					if (actualType === "text")
						target = {
							id: targetId,
							type: "text",
							x: 350 + index * 30,
							y: 100,
							width: 10,
							height: 10,
							fontFamily: 5,
							text: "target",
						};
					else if (actualType === "arrow" || actualType === "line")
						target = connector({
							id: targetId,
							type: actualType,
							x: 350 + index * 30,
							y: 100,
							width: 10,
							points: [
								[0, 0],
								[10, 0],
							],
							...(prefix === "b8" ? { startBinding: { elementId: "b8ob", focus: 0, gap: 0 } } : {}),
						});
					else
						target = {
							id: targetId,
							type: "rectangle",
							x: 350 + index * 30,
							y: 100,
							width: 10,
							height: 10,
						};
					return [
						semanticNode(`${prefix}o`, {
							id: `${prefix}ob`,
							x: 350 + index * 30,
							y: 150,
							boundElements: [{ id: targetId, type: declaredType }],
						}),
						target,
					];
				},
			);
			const elements: PackageElement[] = [
				connector({
					id: "jover",
					y: 300,
					width: 10,
					points: [
						[0, 0],
						["OVERFLOW", 0],
					],
				}),
				semanticNode("blocked-endpoint-node", { id: "bnnode", x: 40 }),
				connector({
					id: "bedge",
					y: 5,
					startBinding: { elementId: "", focus: 0, gap: 0 },
				}),
				semanticNode("reverse-owner", {
					id: "rowner",
					y: 100,
					width: 100,
					height: 100,
					boundElements: [{ id: "rlbl", type: "text" }],
				}),
				{
					id: "rlbl",
					type: "text",
					x: 80,
					y: 120,
					width: 40,
					height: 20,
					fontFamily: 5,
					text: "reverse",
				},
				semanticNode("reverse-unrelated", {
					id: "runrel",
					x: 100,
					y: 100,
					width: 50,
					height: 50,
				}),
				semanticNode("mismatch-owner", {
					id: "mowner",
					x: 200,
					y: 100,
					boundElements: [{ id: "mtarget", type: "text" }],
				}),
				{ id: "mtarget", type: "rectangle", x: 220, y: 100, width: 10, height: 10 },
				semanticNode("unknown-target-owner", {
					id: "uowner",
					x: 260,
					y: 100,
					boundElements: [{ id: "utarget", type: "arrow" }],
				}),
				{ id: "utarget", type: "future-target", x: 280, y: 100, width: 10, height: 10 },
				...targetElements,
				semanticNode("package-aggregate", {
					id: "paggp",
					x: Number.MAX_VALUE,
					y: 300,
					width: 0,
				}),
				semanticNode("package-aggregate", {
					id: "paggn",
					x: -Number.MAX_VALUE,
					y: 300,
					width: 0,
				}),
				{
					id: "pobsp",
					type: "rectangle",
					x: Number.MAX_VALUE,
					y: 320,
					width: 1,
					height: 10,
					groupIds: ["pg"],
				},
				{
					id: "pobsn",
					type: "rectangle",
					x: -Number.MAX_VALUE,
					y: 320,
					width: 1,
					height: 10,
					groupIds: ["pg"],
				},
				semanticNode("duplicate-candidate", { id: "dupn", x: 40, y: 480 }),
				connector({ id: "dupcon", y: 485 }),
				connector({ id: "dupcon", y: 485 }),
				semanticNode("package-max-zone", {
					id: "pmzone",
					y: 600,
					width: Number.MAX_VALUE,
					height: 2,
				}),
				semanticNode("package-max-child", {
					id: "pmchild",
					y: 600,
					width: Number.MAX_VALUE / 2,
					height: 1,
				}),
				{
					id: "pfocus",
					type: "text",
					x: Number.MAX_VALUE,
					y: 700,
					width: 0,
					height: 0,
					fontFamily: 1,
					text: "focus",
				},
				{
					id: "pevid",
					type: "text",
					x: Number.MAX_VALUE,
					y: 720,
					width: Number.MAX_VALUE,
					height: 10,
					fontFamily: 1,
					text: "affected",
					containerId: false,
					boundElements: false,
					customData: { archboard: { node: false, binding: { path: "/absolute" } } },
				},
				{
					id: "pgeom",
					type: "rectangle",
					x: Number.MAX_VALUE,
					y: 740,
					width: Number.MAX_VALUE,
					height: 10,
					angle: 1,
					label: { text: "seed" },
					customData: { archboard: { node: "pgeom" }, library: {} },
				},
				connector({
					id: "pbind",
					x: Number.MAX_VALUE,
					y: 760,
					width: Number.MAX_VALUE,
					angle: 1,
					startBinding: false,
				}),
				connector({
					id: "persisted-large-path",
					y: 800,
					width: 1,
					points: Array.from({ length: 10_000 }, (_, index) => [index, index % 2]),
				}),
			];
			const note = owner.writeBoard("prerequisite-totality", elements);
			writeFileSync(note, readFileSync(note, "utf8").replace('"OVERFLOW"', "1e400"));
			const result = owner.runInspection("prerequisite-totality", ["--strict"]);
			expect(result).toMatchObject({ status: 8, stderr: "" });
			const report = CheckResultSchema.parse(JSON.parse(result.stdout));

			expect(
				report.findings.some(
					(finding) =>
						finding.code === "AMBIGUOUS_GEOMETRY" &&
						finding.reason === "malformed-point" &&
						finding.elements[0]?.id === "jover",
				),
			).toBe(true);
			expect(
				report.findings.find(
					(finding) =>
						finding.reason === "unrepresentable-coordinate-span" &&
						finding.details.scope === "semantic-node-body",
				)?.details,
			).toEqual({
				scope: "semantic-node-body",
				subjectId: "package-aggregate",
				sourceIndexes: [26, 27],
				issue: "finite-constituents-have-no-finite-union",
			});
			expect(
				report.findings.find(
					(finding) =>
						finding.reason === "unrepresentable-coordinate-span" &&
						finding.details.scope === "obstacle-component",
				)?.details,
			).toEqual({
				scope: "obstacle-component",
				subjectId: "obstacle:pobsn,pobsp",
				sourceIndexes: [28, 29],
				issue: "finite-constituents-have-no-finite-union",
			});
			expect(
				report.findings.some(
					(finding) =>
						finding.reason === "duplicate-element-id" && finding.details.duplicateId === "dupcon",
				),
			).toBe(true);
			for (const code of [
				"CONNECTOR_PENETRATES_NODE",
				"CONNECTOR_PENETRATES_OBSTACLE",
				"CONNECTOR_INTERSECTION_UNMARKED",
			])
				expect(
					report.findings.some(
						(finding) => finding.code === code && findingUses(finding, "dupcon"),
					),
				).toBe(false);
			expect(
				report.findings
					.filter((finding) => finding.reason === "bound-element-target-type-mismatch")
					.map((finding) => finding.details.targetId)
					.toSorted(),
			).toEqual(["b1t", "b2t", "b3t", "b4t", "b7t", "mtarget"]);
			for (const targetId of ["b5t", "b6t", "b8t"])
				expect(
					report.findings.some(
						(finding) =>
							finding.reason === "bound-element-target-type-mismatch" &&
							finding.details.targetId === targetId,
					),
				).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.reason === "missing-binding-reciprocal" &&
						finding.details.connectorId === "b8t",
				),
			).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "UNSUPPORTED_GEOMETRY" &&
						finding.reason === "unsupported-type" &&
						finding.elements[0]?.id === "utarget",
				),
			).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "LABEL_OVERLAP" &&
						finding.reason === "label-node-overlap" &&
						finding.details.labelId === "rlbl" &&
						finding.details.nodeId === "reverse-unrelated",
				),
			).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "LABEL_OVERLAP" &&
						finding.reason === "label-node-overlap" &&
						finding.details.labelId === "rlbl" &&
						finding.details.nodeId === "reverse-owner",
				),
			).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "CONNECTOR_PENETRATES_NODE" && finding.details.connectorId === "bedge",
				),
			).toBe(false);
			expect(
				report.findings.some(
					(finding) =>
						finding.reason === "disallowed-font-family" &&
						finding.elements[0]?.id === "pfocus" &&
						finding.affectedBBox?.x === Number.MAX_VALUE &&
						finding.focusBBox === null,
				),
			).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.reason === "unrepresentable-focus-padding" &&
						finding.elements[0]?.id === "pfocus" &&
						finding.details.failedDeltas.includes("x-minus-16"),
				),
			).toBe(true);
			for (const reason of [
				"disallowed-font-family",
				"malformed-container-id",
				"malformed-bound-elements",
				"invalid-node-metadata",
				"invalid-code-binding",
			])
				expect(
					report.findings.some(
						(finding) =>
							finding.reason === reason &&
							finding.elements.some((element) => element.id === "pevid") &&
							finding.affectedBBox?.x === Number.MAX_VALUE,
					),
				).toBe(true);
			for (const reason of ["rotation", "persisted-seed", "invalid-library-attribution"])
				expect(
					report.findings.some(
						(finding) =>
							finding.reason === reason &&
							finding.elements.some((element) => element.id === "pgeom") &&
							finding.affectedBBox?.x === Number.MAX_VALUE,
					),
				).toBe(true);
			expect(
				report.findings
					.filter(
						(finding) =>
							finding.code !== "AMBIGUOUS_GEOMETRY" &&
							finding.elements.some((element) => element.id === "pgeom"),
					)
					.map((finding) => finding.reason)
					.toSorted(),
			).toEqual(["invalid-library-attribution", "persisted-seed", "rotation"]);
			for (const reason of ["rotation", "malformed-start-binding"])
				expect(
					report.findings.some(
						(finding) =>
							finding.reason === reason &&
							finding.elements.some((element) => element.id === "pbind") &&
							finding.affectedBBox?.x === Number.MAX_VALUE,
					),
				).toBe(true);
			expect(
				report.findings
					.filter(
						(finding) =>
							finding.code !== "AMBIGUOUS_GEOMETRY" &&
							finding.elements.some((element) => element.id === "pbind"),
					)
					.map((finding) => finding.reason)
					.toSorted(),
			).toEqual(["malformed-start-binding", "rotation"]);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "STALE_LINEAR_DIMENSIONS" &&
						finding.elements.some((element) => element.id === "persisted-large-path") &&
						finding.details.measuredWidth === 9_999 &&
						finding.details.measuredHeight === 1,
				),
			).toBe(true);
		} finally {
			await owner.dispose();
		}
	});
});
