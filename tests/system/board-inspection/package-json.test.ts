import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { CheckResultSchema } from "../../../src/runtime/board-inspection/index.js";
import {
	cleanScene,
	connector,
	duplicateLabelScene,
	groupApplicabilityScene,
	malformedScene,
} from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

describe("package inspection JSON", () => {
	test("runs the shipped binary without a canvas and validates stdout", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			owner.writeBoard("clean", cleanScene());
			const result = owner.runInspection("clean");
			expect(result).toMatchObject({ status: 0, stderr: "" });
			const parsed = CheckResultSchema.parse(JSON.parse(result.stdout));
			expect(parsed).toMatchObject({
				board: "clean",
				schemaVersion: 2,
				clean: true,
			});
			expect(result.stdout).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
		} finally {
			await owner.dispose();
		}
	});

	test("reports malformed persisted records through the schema", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			owner.writeBoard("malformed", malformedScene());
			const result = owner.runInspection("malformed", ["--strict"]);
			expect(result.status).toBe(8);
			const parsed = CheckResultSchema.parse(JSON.parse(result.stdout));
			expect(parsed.findings.some((finding) => finding.reason === "invalid-element-identity")).toBe(
				true,
			);
			expect(parsed.coverage).toBe("indeterminate");
		} finally {
			await owner.dispose();
		}
	});

	test("preserves the exact persisted control and hierarchy order", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const orderedIds = ["order-\ud800", "order-a", "order-\u0001", "order-\0"];
			const hierarchy = ["\ud800", "a", "\u0001", "\0"].map((suffix) => ({
				id: `hier-body-${suffix}`,
				type: "rectangle",
				x: 600,
				y: 400,
				width: 100,
				height: 100,
				angle: 0,
				customData: { archboard: { node: `hier-owner-${suffix}` } },
			}));
			const exactElements = [
				...orderedIds.map((id, index) => ({
					id,
					type: "text",
					x: index * 100,
					y: 520,
					width: 20,
					height: 10,
					angle: 0,
					fontFamily: 1,
					text: id,
				})),
				...hierarchy,
				{
					id: "hier-child-body",
					type: "rectangle",
					x: 630,
					y: 430,
					width: 10,
					height: 10,
					angle: 0,
					boundElements: [{ id: "hier-edge", type: "arrow" }],
					customData: { archboard: { node: "hier-child" } },
				},
				connector({
					id: "hier-edge",
					x: 620,
					y: 435,
					width: 70,
					points: [
						[0, 0],
						[70, 0],
					],
					startBinding: { elementId: "hier-child-body", focus: 0, gap: 0 },
				}),
			];
			const exactStrings = [
				"order-\ud800",
				"order-\u0001",
				"order-\0",
				"hier-body-\ud800",
				"hier-body-\u0001",
				"hier-body-\0",
				"hier-owner-\ud800",
				"hier-owner-\u0001",
				"hier-owner-\0",
			];
			const replacements = new Map(exactStrings.map((value, index) => [value, `exact${index}`]));
			const placeholderElements = JSON.parse(
				JSON.stringify(exactElements, (_key, value) => replacements.get(value) ?? value),
			);
			const note = owner.writeBoard("exact-order-controls", placeholderElements);
			let bytes = readFileSync(note, "utf8");
			for (const [value, placeholder] of replacements)
				bytes = bytes.replaceAll(JSON.stringify(placeholder), JSON.stringify(value));
			writeFileSync(note, bytes);
			expect(["\\u0000", "\\u0001", "\\ud800"].every((escape) => bytes.includes(escape))).toBe(
				true,
			);
			const result = owner.runInspection("exact-order-controls");
			expect(result).toMatchObject({ status: 0, stderr: "" });
			const parsed = CheckResultSchema.parse(JSON.parse(result.stdout));
			expect(
				parsed.findings
					.filter(
						(finding) =>
							finding.code === "FONT_POLICY_VIOLATION" &&
							finding.reason === "disallowed-font-family",
					)
					.map((finding) => finding.elements[0]?.id),
			).toEqual(["order-\0", "order-\u0001", "order-a", "order-\ud800"]);
			const penetrated = new Set(
				parsed.findings
					.filter((finding) => finding.code === "CONNECTOR_PENETRATES_NODE")
					.map((finding) => finding.details.nodeId),
			);
			expect([...penetrated].toSorted()).toEqual(
				["hier-owner-\u0001", "hier-owner-a", "hier-owner-\ud800"].toSorted(),
			);
			expect(penetrated.has("hier-owner-\0")).toBe(false);
		} finally {
			await owner.dispose();
		}
	});

	test("preserves oldest duplicate-label selection", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			owner.writeBoard("labels", duplicateLabelScene());
			const parsed = CheckResultSchema.parse(
				JSON.parse(owner.runInspection("labels", ["--strict"]).stdout),
			);
			const duplicate = parsed.findings.find((finding) => finding.reason === "duplicate");
			expect(duplicate?.details).toMatchObject({
				keeperId: "old",
				duplicateIds: ["new"],
			});
		} finally {
			await owner.dispose();
		}
	});

	test("preserves group applicability after rejected persisted entries", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			for (const [mode, reason] of [
				["identity", "invalid-element-identity"],
				["coverage", "rotation"],
			] as const) {
				owner.writeBoard(mode, groupApplicabilityScene(mode));
				const result = owner.runInspection(mode, ["--strict"]);
				const report = CheckResultSchema.parse(JSON.parse(result.stdout));
				expect(result.status).toBe(8);
				expect(report.findings.some((finding) => finding.reason === reason)).toBe(true);
			}
		} finally {
			await owner.dispose();
		}
	});
});
