import { expect, test } from "bun:test";
import { applyElementInput } from "../apply-element-input.ts";
import { expandElements, expandForBoard, repairIndices } from "../expand-elements.ts";
import { labelTextIdFor } from "../labels.ts";
import type { ServerElement } from "../types.ts";
import type {
	BoardElementType,
	LegacyElementIngress,
} from "../../../shared/board-elements/index.ts";
import { isBlockId } from "../../../shared/ids/ids.ts";
import { ExpandedElementSchema, type ExpandedElement } from "./fixtures/label-cases.ts";
import { completeElement } from "./support/elements.ts";

const shape = (elements: readonly object[]): string =>
	JSON.stringify(
		elements.map((element) =>
			Object.fromEntries(
				Object.entries(element).filter(
					([key]) => !["seed", "versionNonce", "updated"].includes(key),
				),
			),
		),
	);
const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | undefined, message: string): T => {
	if (value === undefined) throw new Error(message);
	return value;
};
const expandOne = (element: LegacyElementIngress): ExpandedElement[] =>
	ExpandedElementSchema.array().parse(expandElements([element], { deterministic: true }));
const onlyExpanded = (element: LegacyElementIngress, type: BoardElementType): ExpandedElement =>
	required(
		expandOne(element).find((candidate) => candidate.type === type),
		`missing ${type}`,
	);

test("applies label input, preserves order, and pins converter output", () => {
	{
		const board = new Map<string, ServerElement>();
		const applied = applyElementInput(board, {
			origin: "agent",
			upserts: [
				{
					type: "rectangle",
					x: 0,
					y: 0,
					width: 200,
					height: 80,
					text: "Orders",
				},
				{ type: "text", x: 0, y: 120, text: "unsized note" },
			],
		});
		const box = required(applied.named[0], "the box input was not returned");
		const note = required(applied.named[1], "the note input was not returned");
		const label = [...board.values()].find(
			(element) => element.type === "text" && element.containerId === box.id,
		);
		if (label?.type !== "text") throw new Error("the spent label is not text");

		assert(
			applied.named.length === 2,
			"the entry did not return one board-shape element per input",
		);
		assert(
			isBlockId(box.id) && isBlockId(note.id) && isBlockId(label?.id),
			"the entry let an unminted input reach the board without block-safe ids",
		);
		assert(
			!("text" in box) && !("label" in box),
			"the entry left a shape name in an input spelling after conversion",
		);
		assert(
			label?.text === "Orders" && typeof label.width === "number" && label.width > 0,
			"the entry did not spend and measure the shape label",
		);
		assert(
			note.type === "text" && note.width > 0 && typeof note.height === "number",
			"the entry did not measure an unsized standalone text element",
		);

		const beforeVersion = box.version ?? 0;
		const renamed = applyElementInput(board, {
			origin: "agent",
			upserts: [{ id: box.id, text: "Ledger" }],
		});
		const heldBox = required(board.get(box.id), "the renamed box is missing");
		const heldLabel = required(
			[...board.values()].find(
				(element) => element.type === "text" && element.containerId === box.id,
			),
			"the renamed label is missing",
		);
		if (heldLabel.type !== "text") throw new Error("the renamed label is not text");
		assert(
			heldBox.version === beforeVersion + 1 && typeof heldBox.updatedAt === "string",
			"the entry did not bump the updated element version and updatedAt",
		);
		assert(
			heldLabel.text === "Ledger" && renamed.updated.some((element) => element.id === heldLabel.id),
			"the entry did not restate the measured label in its settled delta",
		);
	}

	{
		const ordered = new Map<string, ServerElement>(
			["a0", "a1", "a2", "a2V", "a3"].map((index, position) => {
				const id = ["zero", "one", "two", "inserted", "three"][position]!;
				return [
					id,
					completeElement({ id, type: "rectangle", x: 0, y: 0, width: 1, height: 1, index }),
				] as const;
			}),
		);
		const repaired = repairIndices(ordered);
		assert(
			repaired.length === 0 &&
				[...ordered.values()].map((element) => element.index).join(",") === "a0,a1,a2,a2V,a3",
			"a valid Excalidraw between-index was expanded into cascading canonical corrections",
		);
	}
	{
		const written: LegacyElementIngress[] = [
			{
				id: "svc",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 200,
				height: 80,
				labelText: "AuthService",
			},
			{
				id: "wire",
				type: "arrow",
				x: 0,
				y: 0,
				points: [
					[0, 0],
					[300, 0],
				],
				labelText: "HTTP",
			},
		];
		const wrapped = expandForBoard(
			written.map((el) => ({ ...el })),
			new Map(),
		);
		const converted = expandElements(
			written.map((el) => Object.assign({}, el)),
			{ forStore: true },
		);
		assert(
			shape(wrapped) === shape(converted),
			"the two entry points into the one conversion gave different answers for the same elements, " +
				"which is the divergence ADR 0015 exists to prevent",
		);
	}

	{
		const only = onlyExpanded;
		const box: LegacyElementIngress = {
			id: "r1",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 200,
			height: 100,
		};

		const standalone = only({ id: "t1", type: "text", x: 0, y: 0, text: "caption" }, "text");
		assert(
			standalone.fontFamily === 5,
			`a standalone text is fontFamily ${standalone.fontFamily}, not Excalifont`,
		);
		assert(
			standalone.fontSize === 20,
			`a standalone text is fontSize ${standalone.fontSize}, not 20`,
		);
		const shapeLabel = only({ ...box, labelText: "AuthService" }, "text");
		assert(
			shapeLabel.fontFamily === 5,
			`a shape's label is fontFamily ${shapeLabel.fontFamily}, not Excalifont`,
		);
		assert(
			shapeLabel.fontSize === 20,
			`a shape's label is fontSize ${shapeLabel.fontSize}, not 20`,
		);
		const arrowLabel = only(
			{
				id: "a1",
				type: "arrow",
				x: 0,
				y: 0,
				points: [
					[0, 0],
					[100, 0],
				],
				labelText: "gRPC",
			},
			"text",
		);
		assert(
			arrowLabel.fontSize === 20,
			`an arrow's label is fontSize ${arrowLabel.fontSize}, not 20`,
		);
		assert(
			arrowLabel.fontFamily === 5,
			`an arrow's label is fontFamily ${arrowLabel.fontFamily}, not Excalifont`,
		);

		assert(
			shapeLabel.strokeWidth === 2,
			`a bound text is strokeWidth ${shapeLabel.strokeWidth}, not 2`,
		);

		assert(
			standalone.textAlign === "left",
			`a standalone text is ${standalone.textAlign}-aligned, not left`,
		);
		assert(
			standalone.verticalAlign === "top",
			`a standalone text is ${standalone.verticalAlign}, not top`,
		);
		assert(
			shapeLabel.textAlign === "center" && shapeLabel.verticalAlign === "middle",
			"a bound text is not centred in its container",
		);

		assert(
			JSON.stringify(only(box, "rectangle").roundness) === '{"type":3}',
			"a rectangle is not rounded, so it will not match one a human drew",
		);

		const stroke = only(
			{
				id: "f1",
				type: "freedraw",
				x: 0,
				y: 0,
				points: [
					[0, 0],
					[10, 10],
				],
			},
			"freedraw",
		);
		assert(
			stroke.strokeWidth === 2,
			`a freedraw is strokeWidth ${stroke.strokeWidth}, not the default 2`,
		);
		assert(
			stroke.strokeColor === "#1e1e1e",
			`a freedraw is ${stroke.strokeColor}, not the default stroke colour`,
		);

		const line = only(
			{
				id: "l1",
				type: "line",
				x: 0,
				y: 0,
				points: [
					[0, 0],
					[100, 0],
				],
			},
			"line",
		);
		assert(!("elbowed" in line), "a line was given an `elbowed` field");
		assert(
			only(
				{
					id: "a2",
					type: "arrow",
					x: 0,
					y: 0,
					points: [
						[0, 0],
						[100, 0],
					],
				},
				"arrow",
			).elbowed === false,
			"an arrow was not told whether it is elbowed",
		);

		assert(stroke.lastCommittedPoint === null, "a freedraw has no lastCommittedPoint");
		assert(Array.isArray(stroke.pressures), "a freedraw has no pressures");
		assert(stroke.simulatePressure === true, "a freedraw does not say its pressure is simulated");

		const arrow = only(
			{
				id: "a3",
				type: "arrow",
				x: 0,
				y: 0,
				points: [
					[0, 0],
					[84, 0],
				],
				startBinding: { elementId: "r1", focus: 0, gap: 4 },
			},
			"arrow",
		);
		assert(
			JSON.stringify(arrow.points) === "[[0,0],[84,0]]",
			`a bound arrow's path was rewritten to ${JSON.stringify(arrow.points)}`,
		);

		assert(
			shapeLabel.id === labelTextIdFor("r1"),
			`a label is named ${shapeLabel.id}, not the id derived from its container`,
		);
		assert(isBlockId(shapeLabel.id), `a label's id is not a block id (${shapeLabel.id})`);

		assert(
			shapeLabel.width === 114.5,
			`"AuthService" at Excalifont 20 is ${shapeLabel.width} wide, and Chrome says 114.5`,
		);
		assert(shapeLabel.height === 25, `and ${shapeLabel.height} tall, not 20 x 1.25`);
		assert(
			shapeLabel.x === 0 + (200 - 114.5) / 2 && shapeLabel.y === 0 + (100 - 25) / 2,
			`a label sits at ${shapeLabel.x},${shapeLabel.y} and its container centres it elsewhere`,
		);

		const twelve = ExpandedElementSchema.array().parse(
			expandElements(
				Array.from({ length: 12 }, (_, i) => ({
					id: `e${i}`,
					type: "rectangle",
					x: i * 10,
					y: 0,
					width: 10,
					height: 10,
				})),
				{ deterministic: true },
			),
		);
		const indices = twelve.map((el) => el.index);
		assert(
			indices.every((value, i) => {
				const previous = indices[i - 1];
				return (
					typeof value === "string" &&
					(i === 0 || (typeof previous === "string" && previous < value))
				);
			}),
			`the indices of a twelve-element board do not increase: ${indices.join(" ")}`,
		);
	}
});
