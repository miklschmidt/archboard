import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import {
	CheckResultSchema,
	type InspectionReport,
} from "../../../src/runtime/board-inspection/index.js";
import { expandElements } from "../../../src/runtime/engine/expand-elements.js";
import type { LegacyElementIngress } from "../../../src/shared/board-elements/index.js";
import { connector, type PackageElement } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

type Owner = ReturnType<typeof createPackageInspectionOwner>;

const parse = (owner: Owner, board: string, status = 8) => {
	const result = owner.runInspection(board, ["--strict"]);
	expect(result).toMatchObject({ status, stderr: "" });
	return CheckResultSchema.parse(JSON.parse(result.stdout));
};

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

const writeExactBoard = (
	owner: Owner,
	board: string,
	elements: PackageElement[],
	exactStrings: string[],
) => {
	const replacements = new Map(exactStrings.map((value, index) => [value, `exact${index}`]));
	const placeholders = JSON.parse(
		JSON.stringify(elements, (_key, value) => replacements.get(value) ?? value),
	) as PackageElement[];
	const note = owner.writeBoard(board, placeholders);
	let bytes = readFileSync(note, "utf8");
	for (const [value, placeholder] of replacements)
		bytes = bytes.replaceAll(JSON.stringify(placeholder), JSON.stringify(value));
	writeFileSync(note, bytes);
};

const findingUses = (finding: InspectionReport["findings"][number], id: string) =>
	finding.elements.some((element) => element.id === id) ||
	("connectorId" in finding.details && finding.details.connectorId === id) ||
	("firstConnectorId" in finding.details && finding.details.firstConnectorId === id) ||
	("secondConnectorId" in finding.details && finding.details.secondConnectorId === id);

const persistedConnector = (input: PackageElement): PackageElement =>
	expandElements([input as unknown as LegacyElementIngress], {
		deterministic: true,
		forStore: true,
	})[0]! as unknown as PackageElement;

const unsupportedInteractionScene = (id: string, marker: PackageElement = {}): PackageElement[] => [
	connector({ id, x: 0, y: 50, width: 100, height: 0, ...marker }),
	semanticNode("colliding-node", { x: 40, y: 40, width: 20, height: 20 }),
	{
		id: "library-obstacle",
		type: "rectangle",
		x: 70,
		y: 45,
		width: 10,
		height: 10,
		angle: 0,
		customData: { library: { itemId: "obstacle", source: "catalogue" } },
	},
	connector({
		id: "supported-vertical",
		x: 25,
		y: 0,
		width: 0,
		height: 100,
		points: [
			[0, 0],
			[0, 100],
		],
	}),
	connector({ id: "supported-horizontal", x: 0, y: 25, width: 100, height: 0 }),
];

const persistedInteractionScene = (id: string, marker: PackageElement = {}): PackageElement[] => {
	const [candidate, ...rest] = unsupportedInteractionScene(id, marker);
	return [persistedConnector(candidate!), ...rest];
};

const labelPairBoard = (pairs: readonly (readonly [string, string])[], reverse = false) => {
	const elements = pairs.flatMap(([containerId, textId], index) => [
		{
			id: containerId,
			type: "rectangle",
			x: index * 100,
			y: 0,
			width: 20,
			height: 20,
			angle: 0,
			boundElements: [{ id: textId, type: "text" }],
		},
		{
			id: textId,
			type: "text",
			x: 500 + index * 100,
			y: 500,
			width: 20,
			height: 10,
			angle: 0,
			fontFamily: 5,
			text: textId,
			containerId,
		},
	]);
	return reverse ? elements.toReversed() : elements;
};

describe("package inspection totality", () => {
	test("persists malformed incoming target types as coverage-applicable", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const elements = (
				[
					["missing", undefined],
					["null", null],
					["boolean", false],
					["unknown", "future-target"],
				] as const
			).flatMap(([label, rawType], index) => {
				const target: PackageElement = {
					id: `incoming-${label}`,
					x: 200,
					y: index * 20,
					width: 10,
					height: 10,
					angle: 0,
				};
				if (label !== "missing") target.type = rawType;
				return [
					connector({
						id: `incoming-edge-${label}`,
						y: index * 20,
						width: 10,
						points: [
							[0, 0],
							[10, 0],
						],
						startBinding: { elementId: target.id, focus: 0, gap: 0 },
					}),
					target,
				];
			});
			owner.writeBoard("incoming-types", elements);
			const report = parse(owner, "incoming-types");
			expect(report.coverage).toBe("indeterminate");
			expect(
				report.findings.filter(
					(finding) =>
						finding.code === "UNSUPPORTED_GEOMETRY" &&
						finding.reason === "unsupported-type" &&
						String(finding.elements[0]?.id).startsWith("incoming-"),
				),
			).toHaveLength(4);
		} finally {
			await owner.dispose();
		}
	});

	test("persists recoverable connector modes and narrow geometry refusals", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			for (const [name, marker] of [
				["rounded", { roundness: { type: 2 } }],
				["elbowed", { elbowed: true, fixedSegments: [] }],
			] as const) {
				owner.writeBoard(`${name}-clean`, [persistedConnector(connector({ id: name, ...marker }))]);
				const clean = parse(owner, `${name}-clean`, 0);
				expect(clean.coverage).toBe("complete");
				expect(clean.clean).toBe(true);
				expect(clean.findings.some((finding) => finding.reason === "rounded-or-elbowed")).toBe(
					false,
				);
				owner.writeBoard(`${name}-collision`, persistedInteractionScene(name, marker));
				const collision = parse(owner, `${name}-collision`, 7);
				expect(collision.coverage).toBe("complete");
				for (const code of [
					"CONNECTOR_PENETRATES_NODE",
					"CONNECTOR_PENETRATES_OBSTACLE",
					"CONNECTOR_INTERSECTION_UNMARKED",
				] as const)
					expect(
						collision.findings.some(
							(finding) => finding.code === code && findingUses(finding, name),
						),
					).toBe(true);
			}
			const endpointElements = [true, false, null].flatMap((startIsSpecial, row) =>
				[true, false, null].map((endIsSpecial, column) =>
					persistedConnector(
						connector({
							id: `special-${String(startIsSpecial)}-${String(endIsSpecial)}`,
							x: column * 200,
							y: row * 50,
							elbowed: true,
							fixedSegments: [],
							startIsSpecial,
							endIsSpecial,
						}),
					),
				),
			);
			owner.writeBoard("endpoint-specials", endpointElements);
			const endpointReport = parse(owner, "endpoint-specials", 0);
			expect(endpointReport.coverage).toBe("complete");
			expect(endpointReport.clean).toBe(true);
			for (const coordinate of [1_000_000, -1_000_000] as const) {
				owner.writeBoard(`boundary-${coordinate}`, [
					persistedConnector(
						connector({
							id: `boundary-${coordinate}`,
							x: 31,
							width: Math.abs(coordinate),
							points: [
								[0, 0],
								[coordinate, 0],
							],
							elbowed: true,
							fixedSegments: [],
						}),
					),
				]);
				const report = parse(owner, `boundary-${coordinate}`, 0);
				expect(report.coverage).toBe("complete");
				expect(report.findings.some((finding) => finding.reason === "rounded-or-elbowed")).toBe(
					false,
				);
			}
			for (const coordinate of [1_000_001, -1_000_001] as const) {
				const id = `over-limit-${coordinate}`;
				owner.writeBoard(id, [
					persistedConnector(
						connector({
							id,
							x: 31,
							width: Math.abs(coordinate),
							points: [
								[0, 0],
								[coordinate, 0],
							],
							elbowed: true,
							fixedSegments: [],
						}),
					),
				]);
				const report = parse(owner, id, 8);
				expect(report.coverage).toBe("indeterminate");
				const refusal = report.findings.find(
					(finding) =>
						finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rounded-or-elbowed",
				);
				expect(refusal?.message).toContain(
					`point 1 x coordinate ${coordinate} exceeding ±1,000,000`,
				);
				expect(
					report.findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_NODE"),
				).toBe(false);
			}
			for (const [name, marker] of [
				["malformed-elbowed", { elbowed: "bad" }],
				["fixed", { fixedSegments: [] }],
			] as const) {
				owner.writeBoard(name, unsupportedInteractionScene(name, marker));
				const report = parse(owner, name, 8);
				expect(
					report.findings.some(
						(finding) =>
							finding.code === "UNSUPPORTED_GEOMETRY" &&
							finding.reason === "rounded-or-elbowed" &&
							finding.elements[0]?.id === name,
					),
				).toBe(true);
				for (const code of [
					"CONNECTOR_PENETRATES_NODE",
					"CONNECTOR_PENETRATES_OBSTACLE",
					"CONNECTOR_INTERSECTION_UNMARKED",
				] as const)
					expect(
						report.findings.some((finding) => finding.code === code && findingUses(finding, name)),
					).toBe(false);
			}
		} finally {
			await owner.dispose();
		}
	});

	test("persists injective label pairs and canonical obstacle identities under reversal", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const pairCases = [
				[
					"spaces",
					[
						["a b", "c"],
						["a", "b c"],
					],
				],
				[
					"controls",
					[
						["control\0owner", "text\u001fleft"],
						["control\u001fowner", "text\0right"],
					],
				],
				[
					"prefixes",
					[
						["prefix", "label"],
						["prefix-long", "label-long"],
					],
				],
			] as const;
			for (const [label, pairs] of pairCases) {
				const expected = pairs
					.map(([containerId, textId]) => `${containerId}\0${textId}`)
					.toSorted();
				for (const reverse of [false, true]) {
					const board = `label-pair-${label}-${reverse}`;
					writeExactBoard(owner, board, labelPairBoard(pairs, reverse), pairs.flat());
					const result = owner.runInspection(board, ["--strict"]);
					expect(result).toMatchObject({ status: 7, stderr: "" });
					const report = CheckResultSchema.parse(JSON.parse(result.stdout));
					expect(
						report.findings
							.filter(
								(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "drift",
							)
							.map((finding) => `${finding.details.containerId}\0${finding.details.textId}`)
							.toSorted(),
					).toEqual(expected);
				}
			}
			const obstacleCases = [
				["comma", ["id,part", "plain"], "obstacle:id\\,part,plain"],
				["backslash", ["id\\part", "plain"], "obstacle:id\\\\part,plain"],
				["combined", ["id\\,part", "plain"], "obstacle:id\\\\\\,part,plain"],
				["control", ["id\0part", "plain"], "obstacle:id\0part,plain"],
				["other-control", ["id\u001fpart", "plain"], "obstacle:id\u001fpart,plain"],
				["lone-surrogate", ["\ud800", "plain"], "obstacle:plain,\ud800"],
				["empty-looking-prefix", [",", "\\"], "obstacle:\\,,\\\\"],
			] as const;
			for (const [label, ids, expected] of obstacleCases)
				for (const reverse of [false, true]) {
					const ordered = reverse ? ids.toReversed() : [...ids];
					const board = `obstacle-${label}-${reverse}`;
					writeExactBoard(
						owner,
						board,
						[
							connector({
								id: `through-${label}-${reverse}`,
								x: -10,
								y: 5,
								width: 60,
								points: [
									[0, 0],
									[60, 0],
								],
							}),
							...ordered.map((id, index) => ({
								id,
								type: "rectangle",
								x: index * 20,
								y: 0,
								width: 10,
								height: 10,
								angle: 0,
								groupIds: [`persisted-${label}`],
							})),
						],
						[...ids],
					);
					const result = owner.runInspection(board);
					expect(result).toMatchObject({ status: 0, stderr: "" });
					const report = CheckResultSchema.parse(JSON.parse(result.stdout));
					expect(
						new Set(
							report.findings.flatMap((finding) =>
								finding.obstacles.map((obstacle) => obstacle.id),
							),
						).has(expected),
					).toBe(true);
				}
		} finally {
			await owner.dispose();
		}
	});
});
