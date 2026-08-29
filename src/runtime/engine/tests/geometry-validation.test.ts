import { expect, test } from "bun:test";
import { applyElementInput } from "../apply-element-input.ts";
import { validateRenderGeometry, type RenderGeometryElement } from "../geometry.ts";
import type { ServerElement } from "../types.ts";
import { completeElement } from "./support/elements.ts";

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
test("refuses every malformed live render field without mutating caller state", () => {
	{
		let error: Error | undefined;
		try {
			const malformed = [
				{
					id: "helvetica",
					type: "text",
					fontFamily: 2,
					x: 10,
					y: 20,
					text: "unmeasurable",
				},
				{
					id: "bad-box",
					type: "rectangle",
					x: Number.POSITIVE_INFINITY,
					y: Number.NaN,
					width: 80,
					height: undefined,
				},
				{ id: "old", type: "text", isDeleted: true, x: Number.NaN },
			] satisfies Array<RenderGeometryElement & Record<string, unknown>>;
			validateRenderGeometry(malformed);
		} catch (caught) {
			if (caught instanceof Error) error = caught;
		}
		assert(error instanceof Error, "missing and non-finite render geometry should be refused");
		assert(
			error?.message.includes("helvetica (text): width, height"),
			`the Helvetica refusal should name its id, type and both fields: ${error?.message}`,
		);
		assert(
			error?.message.includes("bad-box (rectangle): x, y, height"),
			`the refusal should report every bad field on every live element: ${error?.message}`,
		);
		assert(
			!error?.message.includes("old"),
			`a deleted element was treated as renderable: ${error?.message}`,
		);

		let valid = true;
		try {
			validateRenderGeometry([
				{ id: "point", type: "rectangle", x: -10, y: 0, width: 0, height: 0 },
			]);
		} catch {
			valid = false;
		}
		assert(valid, "finite zero and negative geometry should remain valid");

		const publicBoard = new Map<string, ServerElement>([
			[
				"seed",
				completeElement({ id: "seed", type: "rectangle", x: 0, y: 0, width: 80, height: 40 }),
			],
		]);
		let publicError: Error | undefined;
		try {
			applyElementInput(publicBoard, {
				origin: "human",
				upserts: [
					{
						id: "public-helvetica",
						type: "text",
						x: 10,
						y: 20,
						text: "unmeasurable",
						fontFamily: 2,
						autoResize: true,
					},
				],
			});
		} catch (caught) {
			if (caught instanceof Error) publicError = caught;
		}
		assert(
			publicError?.message.includes(
				"write ingress element public-helvetica: invalid element public-helvetica (text) at element.width",
			),
			`applyElementInput returned malformed public output: ${publicError?.message ?? "no refusal"}`,
		);
		assert(
			publicBoard.size === 1 && publicBoard.has("seed"),
			`applyElementInput left malformed state in its caller's board: ${[...publicBoard.keys()].join(", ")}`,
		);
	}
});
