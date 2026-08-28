import { describe, expect, test } from "bun:test";
import { InspectionReportSchema, inspectBoard } from "../index.js";
import { boundLabel, connector, labelContainer, semanticNode } from "./fixtures/elements.js";

const supportedConnectorCodes = new Set([
	"STALE_LINEAR_DIMENSIONS",
	"CONNECTOR_PENETRATES_NODE",
	"CONNECTOR_PENETRATES_OBSTACLE",
	"CONNECTOR_INTERSECTION_UNMARKED",
]);

const usesConnector = (finding: ReturnType<typeof inspectBoard>["findings"][number], id: string) =>
	finding.elements.some((element) => element.id === id) ||
	("connectorId" in finding.details && finding.details.connectorId === id) ||
	("firstConnectorId" in finding.details && finding.details.firstConnectorId === id) ||
	("secondConnectorId" in finding.details && finding.details.secondConnectorId === id);

const ownershipOwner = (id: string, boundElements: unknown[]) =>
	semanticNode(id, { id: `${id}-body`, width: 100, height: 100, boundElements });
const ownershipLabel = (overrides: Record<string, unknown> = {}) => ({
	id: "ownership-label",
	type: "text",
	x: 35,
	y: 20,
	width: 30,
	height: 20,
	fontFamily: 5,
	text: "ownership",
	...overrides,
});

describe("binding classification", () => {
	test("classifies forward, reverse, reciprocal, and wrong-target bindings", () => {
		const states = [
			[connector({ startBinding: { elementId: "node", focus: 0, gap: 0 } }), semanticNode("node")],
			[connector(), semanticNode("node", { boundElements: [{ id: "edge", type: "arrow" }] })],
			[
				connector({ startBinding: { elementId: "node", focus: 0, gap: 0 } }),
				semanticNode("node", { boundElements: [{ id: "edge", type: "arrow" }] }),
			],
			[
				connector({ startBinding: { elementId: "text", focus: 0, gap: 0 } }),
				boundLabel({ id: "text" }),
			],
		] as const;
		for (const elements of states)
			expect(InspectionReportSchema.safeParse(inspectBoard([...elements])).success).toBe(true);
		expect(inspectBoard([...states[2]]).findings.some((f) => f.reason.includes("binding"))).toBe(
			false,
		);
		expect(inspectBoard([...states[3]]).findings.some((f) => f.code === "BROKEN_REFERENCE")).toBe(
			true,
		);
	});

	test("suppresses downstream findings when ownership is ambiguous", () => {
		const report = inspectBoard([
			labelContainer({ id: "a", boundElements: [{ id: "label", type: "text" }] }),
			labelContainer({ id: "b", x: 300, boundElements: [{ id: "label", type: "text" }] }),
			boundLabel({ id: "label", containerId: "a" }),
			semanticNode("unrelated", { x: 50, y: 20 }),
		]);
		expect(report.coverage).toBe("indeterminate");
		expect(report.findings.some((f) => f.reason === "conflicting-owner")).toBe(true);
		expect(
			report.findings.some(
				(f) =>
					f.code === "LABEL_OVERLAP" &&
					f.reason === "label-node-overlap" &&
					f.details.nodeId === "a",
			),
		).toBe(false);
	});

	test("shares ownership exclusions across forward, reverse, and malformed references", () => {
		const cases = [
			[
				"forward",
				[ownershipOwner("owner", []), ownershipLabel({ containerId: "owner-body" })],
				false,
			],
			[
				"reverse",
				[ownershipOwner("owner", [{ id: "ownership-label", type: "text" }]), ownershipLabel()],
				false,
			],
			[
				"matching",
				[
					ownershipOwner("owner", [{ id: "ownership-label", type: "text" }]),
					ownershipLabel({ containerId: "owner-body" }),
				],
				false,
			],
			[
				"conflicting",
				[
					ownershipOwner("owner", [{ id: "ownership-label", type: "text" }]),
					ownershipOwner("other-owner", [{ id: "ownership-label", type: "text" }]),
					ownershipLabel({ containerId: "owner-body" }),
				],
				true,
			],
		] as const;
		for (const [, elements, indeterminate] of cases) {
			const report = inspectBoard([
				...elements,
				semanticNode("unrelated", { id: "unrelated-body", x: 50, width: 100, height: 100 }),
			]);
			if (indeterminate) expect(report.coverage).toBe("indeterminate");
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "LABEL_OVERLAP" &&
						finding.reason === "label-node-overlap" &&
						finding.details.labelId === "ownership-label" &&
						finding.details.nodeId === "unrelated",
				),
			).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.code === "LABEL_OVERLAP" &&
						finding.reason === "label-node-overlap" &&
						["owner", "other-owner"].includes(finding.details.nodeId),
				),
			).toBe(false);
		}

		const ancestor = inspectBoard([
			semanticNode("zone", { id: "zone-body", width: 200, height: 200 }),
			semanticNode("owner", {
				id: "owner-body",
				x: 20,
				y: 20,
				width: 80,
				height: 80,
				boundElements: [{ id: "ancestor-label", type: "text" }],
			}),
			{
				id: "ancestor-label",
				type: "text",
				x: 90,
				y: 40,
				width: 30,
				height: 20,
				fontFamily: 5,
				text: "reverse",
			},
		]);
		expect(
			ancestor.findings.some(
				(finding) =>
					finding.code === "LABEL_OVERLAP" &&
					finding.reason === "label-node-overlap" &&
					["owner", "zone"].includes(finding.details.nodeId),
			),
		).toBe(false);

		const blocked = inspectBoard([
			ownershipOwner("owner", [{ id: "ownership-label", type: "text" }, { id: "broken-entry" }]),
			ownershipLabel(),
			semanticNode("unrelated", { id: "unrelated-body", x: 50, width: 100, height: 100 }),
		]);
		expect(blocked.coverage).toBe("indeterminate");
		expect(
			blocked.findings.some(
				(finding) => finding.reason === "malformed-bound-elements" && finding.affectsCoverage,
			),
		).toBe(true);
		expect(
			blocked.findings.some(
				(finding) =>
					finding.code === "LABEL_OVERLAP" &&
					finding.reason === "label-node-overlap" &&
					finding.details.labelId === "ownership-label",
			),
		).toBe(false);
	});

	test("keeps the bounded 80-case prerequisite matrix schema-total and gated", () => {
		const identities = [
			["valid", "valid"],
			["missing", undefined],
			["empty", ""],
			["non-string", 42],
		] as const;
		const coordinates = [
			["finite", { x: 0, y: 5, width: 100, height: 0 }, false, true],
			["nan-x", { x: Number.NaN, y: 5, width: 100, height: 0 }, true, false],
			[
				"positive-infinity-x",
				{ x: Number.POSITIVE_INFINITY, y: 5, width: 100, height: 0 },
				true,
				false,
			],
			[
				"negative-infinity-y",
				{ x: 0, y: Number.NEGATIVE_INFINITY, width: 100, height: 0 },
				true,
				false,
			],
			[
				"overflowed-stored-extent",
				{ x: Number.MAX_VALUE, y: 5, width: Number.MAX_VALUE, height: 0 },
				true,
				true,
			],
		] as const;
		const paths = [
			[
				"valid",
				[
					[0, 0],
					[100, 0],
				],
				false,
			],
			["missing", undefined, true],
			[
				"malformed",
				[
					[0, 0],
					["bad", 0],
				],
				true,
			],
			[
				"overflow",
				[
					[0, 0],
					[Number.MAX_VALUE, 0],
				],
				true,
			],
		] as const;
		const endpoints = [
			["absent", undefined, false],
			["readable", { elementId: "candidate", focus: 0, gap: 0 }, false],
			["not-object", "bad", true],
			["empty-id", { elementId: "", focus: 0, gap: 0 }, true],
		] as const;
		const ownerships = [
			"matching",
			"forward-only",
			"reverse-only",
			"conflicting",
			"malformed",
		] as const;
		const targets = ["matching", "mismatch", "missing", "unknown"] as const;
		let index = 0;
		for (const [identity, rawId] of identities)
			for (const [, geometry, coordinateIndeterminate, locatableOrigin] of coordinates)
				for (const [, rawPoints, pathIndeterminate] of paths) {
					const [endpoint, endpointBinding, endpointBlocked] = endpoints[index % endpoints.length]!;
					const ownership = ownerships[Math.floor(index / endpoints.length) % ownerships.length]!;
					const target =
						targets[Math.floor(index / (endpoints.length * ownerships.length)) % targets.length]!;
					const prefix = `totality-${index}`;
					const connectorId = `${prefix}-edge`;
					const candidateId = `${prefix}-candidate`;
					const edge: Record<string, unknown> = { type: "arrow", ...geometry, angle: 0 };
					if (rawPoints !== undefined) edge.points = rawPoints;
					if (endpointBinding !== undefined) edge.startBinding = endpointBinding;
					if (identity === "valid") edge.id = connectorId;
					else if (identity !== "missing") edge.id = rawId;
					if (endpoint === "readable")
						edge.startBinding = { ...endpointBinding, elementId: candidateId };
					const labelId = `${prefix}-label`;
					const ownerAId = `${prefix}-owner-a`;
					const ownerBId = `${prefix}-owner-b`;
					const ownerARefs = ["matching", "reverse-only", "conflicting", "malformed"].includes(
						ownership,
					)
						? [{ id: labelId, type: "text" }]
						: [];
					const ownerBRefs = ownership === "conflicting" ? [{ id: labelId, type: "text" }] : [];
					const containerId = ["matching", "forward-only", "conflicting"].includes(ownership)
						? `${ownerAId}-body`
						: ownership === "malformed"
							? false
							: undefined;
					const targetId = `${prefix}-bound-target`;
					const targetElements =
						target === "missing"
							? []
							: [
									target === "matching"
										? {
												id: targetId,
												type: "text",
												x: 410,
												y: 210,
												width: 20,
												height: 10,
												fontFamily: 5,
												text: "target",
											}
										: {
												id: targetId,
												type: target === "mismatch" ? "rectangle" : "future-target",
												x: 410,
												y: 210,
												width: 20,
												height: 10,
											},
								];
					const report = inspectBoard([
						edge,
						semanticNode(candidateId, { x: 40, y: 0 }),
						semanticNode(ownerAId, {
							id: `${ownerAId}-body`,
							width: 100,
							height: 100,
							boundElements: ownerARefs,
						}),
						semanticNode(ownerBId, {
							id: `${ownerBId}-body`,
							width: 100,
							height: 100,
							boundElements: ownerBRefs,
						}),
						{
							id: labelId,
							type: "text",
							x: 35,
							y: 20,
							width: 30,
							height: 20,
							fontFamily: 5,
							text: "ownership",
							...(containerId === undefined ? {} : { containerId }),
						},
						semanticNode(`${prefix}-unrelated`, { x: 50, y: 20 }),
						semanticNode(`${prefix}-reference-owner`, {
							id: `${prefix}-reference-owner-body`,
							x: 400,
							y: 200,
							boundElements: [{ id: targetId, type: "text" }],
						}),
						...targetElements,
					]);
					const identityInvalid = identity !== "valid";
					const ownershipIndeterminate = ownership === "conflicting" || ownership === "malformed";
					const targetIndeterminate = target === "mismatch" || target === "unknown";
					const prerequisiteSkipped =
						identityInvalid ||
						coordinateIndeterminate ||
						pathIndeterminate ||
						endpointBlocked ||
						ownershipIndeterminate ||
						targetIndeterminate;
					const geometryEligible = !identityInvalid && locatableOrigin && !pathIndeterminate;
					expect(InspectionReportSchema.safeParse(report).success).toBe(true);
					if (prerequisiteSkipped) expect(report.coverage).toBe("indeterminate");
					if (!geometryEligible)
						expect(
							report.findings.some(
								(f) => supportedConnectorCodes.has(f.code) && usesConnector(f, connectorId),
							),
						).toBe(false);
					if (endpointBlocked)
						expect(
							report.findings.some(
								(f) =>
									f.code === "CONNECTOR_PENETRATES_NODE" && f.details.connectorId === connectorId,
							),
						).toBe(false);
					if (ownership === "malformed")
						expect(
							report.findings.some(
								(f) =>
									f.code === "LABEL_OVERLAP" &&
									f.reason === "label-node-overlap" &&
									f.details.labelId === labelId,
							),
						).toBe(false);
					else
						expect(
							report.findings.some(
								(f) =>
									f.code === "LABEL_OVERLAP" &&
									f.reason === "label-node-overlap" &&
									f.details.labelId === labelId &&
									f.details.nodeId === `${prefix}-unrelated`,
							),
						).toBe(true);
					if (ownership === "conflicting")
						expect(
							report.findings.some(
								(f) =>
									f.code === "LABEL_OVERLAP" &&
									f.reason === "label-node-overlap" &&
									f.details.labelId === labelId &&
									[ownerAId, ownerBId].includes(f.details.nodeId),
							),
						).toBe(false);
					index += 1;
				}
		expect(index).toBe(80);
	});
});
