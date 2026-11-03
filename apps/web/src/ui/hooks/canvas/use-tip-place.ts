// Where the open tip stands in its pane, kept up to date as its words arrive.

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { tipGround } from "#ui/clients/canvas/subjects/tip-ground.ts";
import type { TipPoint, TipTarget } from "#ui/clients/canvas/subjects/subject-tips.ts";
import { tipSpot, type ScreenBox } from "#ui/rules/canvas/picture/tip-spot.ts";

/** The open tip, as the place reads it. */
interface PlacedTip {
	/** The part whose tip is open, or null. */
	readonly shown: TipTarget | null;
	/** Where the pointer rested when the tip opened. */
	readonly at: TipPoint;
}

/** How far round the pointer a tip keeps clear of a line, which is too thin and long to stand against. */
const POINTER_REACH = 16;

/** A tip that has no spot yet takes its room and shows nothing. */
const UNPLACED: CSSProperties = { visibility: "hidden" };

/**
 * The box a tip stands against: the part, or the pointer on a line.
 * @param shown The part.
 * @param at Where the pointer rested.
 * @returns The box on the screen.
 */
function standsAgainst(shown: TipTarget, at: TipPoint): ScreenBox {
	if (shown.part !== "line") return shown.drawn.getBoundingClientRect();
	return {
		left: at.x - POINTER_REACH,
		top: at.y - POINTER_REACH,
		right: at.x + POINTER_REACH,
		bottom: at.y + POINTER_REACH,
	};
}

/**
 * Stand the open tip on the best spot of its pane, before the screen shows it.
 * @param tip The open tip.
 * @param standing What the light leaves standing, or null.
 * @returns The element to stand there, and its style.
 */
function useTipPlace(
	tip: PlacedTip,
	standing: ReadonlySet<string> | null,
): { readonly place: RefObject<HTMLDivElement | null>; readonly style: CSSProperties } {
	const place = useRef<HTMLDivElement>(null);
	const [style, setStyle] = useState(UNPLACED);
	const { shown, at } = tip;
	useLayoutEffect(() => {
		const element = place.current;
		const pane = element?.parentElement;
		if (shown === null || element === null || pane === null || pane === undefined) {
			setStyle(UNPLACED);
			return undefined;
		}
		let weighed: DOMRect | null = null;
		/** Weigh the spots again for a tip of a new size. */
		const stand = (): void => {
			const size = element.getBoundingClientRect();
			if (size.width === weighed?.width && size.height === weighed.height) return;
			weighed = size;
			const box = pane.getBoundingClientRect();
			const spot = tipSpot({
				part: standsAgainst(shown, at),
				size,
				pane: box,
				ground: tipGround(shown.drawn, standing),
			});
			const x = Math.round(spot.left - box.left);
			const y = Math.round(spot.top - box.top);
			setStyle({ transform: `translate(${x}px, ${y}px)` });
		};
		stand();
		const watching = new ResizeObserver(stand);
		watching.observe(element);
		return () => {
			watching.disconnect();
		};
	}, [shown, at, standing]);
	return { place, style };
}

export { useTipPlace, type PlacedTip };
