import { expect, test } from "bun:test";

import { layJoined, type Joined, type Page } from "@/transformers/semantic-renderer/layout";

/** One layout the joins asked for: which blocks apart, and whether it was called off before it was laid out. */
interface Asked {
	readonly apart: string;
	calledOff: boolean;
}

/**
 * A page with no lines, so the one that fits the reference pane better reads better.
 * @param side Its width and height.
 * @returns The page.
 */
function page(side: number): Page {
	return { width: side, height: side, edges: [] };
}

test("a turn kept calls off the layouts asked for ahead of it, and one asked for again is laid out afresh", async () => {
	// Two blocks, so the turns from every join apart ask again for the sets
	// the turns from none apart asked for ahead.
	const tree: Joined = { joining: new Set(["A", "B"]), projections: [] };
	const sides: Record<string, number> = { "": 4000, "A,B": 2000, A: 3000, B: 3000 };
	const asked: Asked[] = [];
	/**
	 * Lay a page out a task later, as a worker answers, unless called off while it waits.
	 * @param apart The blocks apart.
	 * @param signal Calls it off.
	 * @returns The page.
	 */
	const lay = (apart: ReadonlySet<string>, signal?: AbortSignal): Promise<Page> => {
		const one: Asked = { apart: [...apart].toSorted().join(","), calledOff: false };
		asked.push(one);
		return new Promise((resolve, reject) => {
			let waiting = true;
			const laying = setTimeout(() => {
				waiting = false;
				resolve(page(sides[one.apart]!));
			}, 0);
			signal?.addEventListener("abort", () => {
				if (!waiting) return;
				clearTimeout(laying);
				one.calledOff = true;
				reject(signal.reason);
			});
		});
	};

	const drawn = await layJoined(tree, lay);

	expect(drawn.placed).toEqual(page(2000));
	expect(asked).toEqual([
		{ apart: "", calledOff: false },
		{ apart: "A,B", calledOff: false },
		{ apart: "A", calledOff: true },
		{ apart: "B", calledOff: true },
		{ apart: "B", calledOff: false },
		{ apart: "A", calledOff: false },
	]);
});
