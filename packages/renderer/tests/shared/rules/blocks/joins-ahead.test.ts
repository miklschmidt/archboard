import { expect, test } from "bun:test";

import { layJoined } from "#shared/rules/blocks/tree/joins-laid.ts";

/** One layout the joins asked for: which blocks apart, and whether it was called off before it was laid out. */
interface Asked {
	readonly apart: string;
	calledOff: boolean;
}

/** A drawing: a square page, the smaller of two reading better. */
interface Page {
	readonly side: number;
}

/**
 * A page.
 * @param side Its width and height.
 * @returns The page.
 */
function page(side: number): Page {
	return { side };
}

/**
 * Whether one page reads better than another: it is smaller.
 * @param one A page.
 * @param other Another.
 * @returns True when the first is smaller.
 */
function smaller(one: Page, other: Page): boolean {
	return one.side < other.side;
}

/** One choice of joins: the blocks, the side of each page they lay out, and what they ask for. */
interface Choice {
	readonly blocks: string[];
	readonly sides: Record<string, number>;
	readonly asked: Asked[];
}

test.each<Choice>([
	{
		// Two blocks: the turns from every join apart weigh the sets the turns
		// from none apart asked for ahead, so nothing is called off.
		blocks: ["A", "B"],
		sides: { "": 4000, "A,B": 2000 },
		asked: [
			{ apart: "", calledOff: false },
			{ apart: "A,B", calledOff: false },
			{ apart: "A", calledOff: false },
			{ apart: "B", calledOff: false },
		],
	},
	{
		// Three blocks: every join apart is kept, then B and C apart, so the
		// turns after each ask for sets the turns before them called off.
		blocks: ["A", "B", "C"],
		sides: { "": 4000, "A,B,C": 3000, "B,C": 2000 },
		asked: [
			{ apart: "", calledOff: false },
			{ apart: "A,B,C", calledOff: false },
			{ apart: "A", calledOff: true },
			{ apart: "B", calledOff: true },
			{ apart: "C", calledOff: true },
			{ apart: "B,C", calledOff: false },
			{ apart: "A,C", calledOff: true },
			{ apart: "A,B", calledOff: true },
			{ apart: "C", calledOff: false },
			{ apart: "B", calledOff: false },
		],
	},
])(
	"with $blocks joining, a turn kept calls off only the layouts asked for ahead that no turn to come weighs, and one asked for again is laid out afresh",
	async ({ blocks, sides, asked: expected }) => {
		const asked: Asked[] = [];
		/**
		 * Lay a page out a task later, as a worker answers, unless called off while it waits.
		 * @param apart The blocks apart.
		 * @param signal Calls it off.
		 * @returns The page.
		 */
		const lay = (apart: ReadonlySet<string>, signal: AbortSignal): Promise<Page> => {
			const one: Asked = { apart: [...apart].toSorted().join(","), calledOff: false };
			asked.push(one);
			return new Promise((resolve, reject) => {
				let waiting = true;
				const laying = setTimeout(() => {
					waiting = false;
					resolve(page(sides[one.apart] ?? 3000));
				}, 0);
				signal.addEventListener("abort", () => {
					if (!waiting) return;
					clearTimeout(laying);
					one.calledOff = true;
					reject(signal.reason);
				});
			});
		};

		const drawn = await layJoined(blocks, smaller, lay);

		expect(drawn).toEqual(page(2000));
		expect(asked).toEqual(expected);
	},
);
