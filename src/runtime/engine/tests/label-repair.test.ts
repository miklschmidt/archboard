import { expect, test } from "bun:test";
import { expandElements, expandForBoard } from "../expand-elements.ts";
import { boundTextsByContainer, labelTextIdFor, planLabelRepair } from "../labels.ts";
import { isBlockId } from "../../../shared/ids/ids.ts";
import { ExpandedElementSchema, pollutedLabels } from "./fixtures/label-cases.ts";
import type { ServerElement } from "../types.ts";

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const worstLabelCount = (elements: Parameters<typeof boundTextsByContainer>[0]): number => {
	const counts = [...boundTextsByContainer(elements).values()].map((ids) => ids.length);
	return counts.length === 0 ? 0 : Math.max(...counts);
};

test("repairs absent, dangling, one-way, duplicate, and polluted label bindings", () => {
	{
		const written = ExpandedElementSchema.array().parse(
			expandElements(
				[
					{
						id: "svc",
						type: "rectangle",
						x: 0,
						y: 0,
						width: 200,
						height: 80,
						label: { text: "AuthService" },
					},
					{
						id: labelTextIdFor("svc"),
						type: "text",
						x: 0,
						y: 0,
						width: 0,
						height: 0,
						containerId: "svc",
						text: "",
						isDeleted: true,
					},
				],
				{ forStore: true },
			),
		);
		const fresh = written.find((element) => element.type === "text" && !element.isDeleted);
		assert(fresh !== undefined, "a label with no live text element was not expanded");
		if (!fresh) throw new Error("The expanded label is missing.");
		assert(
			fresh.id !== labelTextIdFor("svc"),
			"a re-expanded label took the cleared element’s name",
		);
		assert(isBlockId(fresh.id), `the salted name is not a block id (${fresh.id})`);
		const ids = written.map((element) => element.id);
		assert(
			new Set(ids).size === ids.length,
			`expansion produced a duplicate id: ${ids.join(", ")}`,
		);
		assert(
			written.some((element) => element.isDeleted && element.id === labelTextIdFor("svc")),
			"the cleared label was renamed onto the new one",
		);
		assert(
			expandElements([{ id: "bare", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }], {
				forStore: true,
			}).length === 1,
			"an unlabelled shape was given a label",
		);
	}

	{
		const board = new Map<string, ServerElement>([
			["svc", { id: "svc", type: "rectangle", x: 0, y: 0, width: 200, height: 80 }],
			[
				"svclabel",
				{
					id: "svclabel",
					type: "text",
					x: 50,
					y: 20,
					width: 100,
					height: 25,
					containerId: "svc",
					text: "AuthService",
				},
			],
		]);
		const svc = board.get("svc");
		if (!svc) throw new Error("The one-way binding fixture lost svc.");
		const written = expandForBoard([{ ...svc, label: { text: "IdentityService" } }], board);
		const container = written.find((element) => element.id === "svc");
		assert(
			(container?.boundElements ?? []).some((ref) => ref.type === "text" && ref.id === "svclabel"),
			"a one-directional binding was not repaired, so the label would not be drawn",
		);
		assert(written.length === 1, `the container grew a second label: ${written.length} elements`);
	}

	{
		const written = expandForBoard(
			[{ id: "note", type: "text", x: 0, y: 0, text: "a note to self" }],
			new Map(),
		);
		assert(
			written.length === 1 && written[0]?.text === "a note to self",
			"a standalone text element lost its content or grew a label",
		);
	}

	{
		const seededElements = expandForBoard(
			[
				{
					id: "svc",
					type: "rectangle",
					x: 0,
					y: 0,
					width: 200,
					height: 80,
					label: { text: "AuthService" },
				},
			],
			new Map(),
		);
		assert(
			seededElements.length === 2,
			`an unexpanded label produced ${seededElements.length} elements, not two`,
		);
		assert(
			seededElements.find((el) => el.type === "text")?.text === "AuthService",
			"an unexpanded label was dropped",
		);

		const dangling = expandForBoard(
			[
				{
					id: "svc",
					type: "rectangle",
					x: 0,
					y: 0,
					width: 200,
					height: 80,
					label: { text: "AuthService" },
					boundElements: [{ id: "gone", type: "text" }],
				},
			],
			new Map(),
		);
		assert(
			dangling.find((el) => el.type === "text")?.text === "AuthService",
			"a dangling reference suppressed a real label",
		);
	}

	{
		const polluted = pollutedLabels();

		const plan = planLabelRepair(polluted);
		assert(
			plan.duplicates.length === 3,
			`repair found ${plan.duplicates.length} duplicated containers, expected 3`,
		);

		const doomed = new Set(plan.removeIds);
		const rebind = new Map(plan.rebind.map((entry) => [entry.id, entry.boundElements]));
		const repaired = polluted
			.filter((element) => !doomed.has(element.id))
			.map((element) =>
				rebind.has(element.id)
					? Object.assign({}, element, {
							boundElements: rebind.get(element.id),
						})
					: element,
			);

		assert(repaired.length === 6, `repaired board has ${repaired.length} elements, expected 6`);
		assert(
			worstLabelCount(repaired) === 1,
			"repair left a container with more than one bound text",
		);
		assert(planLabelRepair(repaired).duplicates.length === 0, "repair is not a fixed point");
		assert(
			repaired
				.filter((el) => el.type === "text")
				.map((t) => t.text)
				.toSorted((a, b) => String(a).localeCompare(String(b)))
				.join("|") === "AuthService|Gateway|HTTP",
			"repair dropped a label a human could read",
		);
	}
});
