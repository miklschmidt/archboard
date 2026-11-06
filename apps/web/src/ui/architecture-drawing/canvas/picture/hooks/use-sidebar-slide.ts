// A sidebar that comes and goes is drawn while it is on screen and while it is
// on its way out, so what leaves is seen leaving, and not at all while it is
// away, so an empty column is never in the way or in the tab order.
//
// What eases is the stylesheet's (app.css, keyed by the attributes the sidebar
// is drawn with): a docked column its width, a floating panel its place and its
// opacity. This says what is mounted, which of the two the change is, and when
// the leaving is over. A change in mind part-way, a panel asked for again while
// it leaves, takes the panel back where it is and starts nothing twice. Once what
// began has run its course the change is forgotten, so that the sidebar coming
// back on screen some other way, as after a presentation, is not eased as well.

import { useEffect, useState } from "react";

import { COLUMN_MS, SIDEBAR_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";

/** Where the sidebar is. */
type Place = "docked" | "floating" | "away";

/** What the sidebar's coming or going is drawn as. */
interface Slide {
	/** Whether the sidebar is drawn at all. */
	readonly mounted: boolean;
	/** Whether it is on its way out. */
	readonly leaving: boolean;
	/** How it is placed while it is drawn: where it is, or where it was while it leaves. */
	readonly shownAs: "docked" | "floating";
	/** Which easing the last change asks for, or none when it was a swap: a floating panel pinned. */
	readonly motion: "dock" | "float" | "none";
}

/** What the hook keeps between renders. */
interface Kept {
	readonly place: Place;
	readonly shownAs: Slide["shownAs"];
	readonly leaving: boolean;
	readonly motion: Slide["motion"];
}

/**
 * How long the leaving of a placement takes.
 * @param shownAs How it was placed.
 * @returns Milliseconds.
 */
function leavingMs(shownAs: Slide["shownAs"]): number {
	return shownAs === "docked" ? SIDEBAR_MS.dock : SIDEBAR_MS.floatOut;
}

/**
 * What is kept once the sidebar has moved to a place.
 * @param kept What was kept.
 * @param place Where the sidebar is now.
 * @returns What to keep.
 */
function movedTo(kept: Kept, place: Place): Kept {
	if (place === "away") {
		return {
			place,
			shownAs: kept.shownAs,
			leaving: true,
			motion: kept.shownAs === "docked" ? "dock" : "float",
		};
	}
	// A floating panel pinned stays where it is while its column opens round it,
	// so nothing is eased: the panel is not seen to move.
	const swap = kept.place === "floating" && place === "docked";
	return {
		place,
		shownAs: place,
		leaving: false,
		motion: swap ? "none" : place === "docked" ? "dock" : "float",
	};
}

/**
 * Which of the sidebar's placements is drawn, and how it comes and goes.
 * @param place Where the sidebar is.
 * @returns What to draw.
 */
function useSidebarSlide(place: Place): Slide {
	const [kept, setKept] = useState<Kept>({
		place,
		shownAs: place === "floating" ? "floating" : "docked",
		leaving: false,
		motion: "none",
	});
	// Set in the render that changes the place, so a sidebar that is put away is
	// never unmounted before it has left.
	if (kept.place !== place) {
		setKept(movedTo(kept, place));
	}
	const { leaving, shownAs, motion } = kept;
	useEffect(() => {
		if (!leaving) {
			return undefined;
		}
		const clock = frameClock();
		const timer = clock.after(leavingMs(shownAs) + COLUMN_MS.slideSettled, () =>
			setKept((now) => ({ ...now, leaving: false })),
		);
		return () => clock.cancelAfter(timer);
	}, [leaving, shownAs]);
	useEffect(() => {
		if (leaving || motion === "none") {
			return undefined;
		}
		const clock = frameClock();
		const timer = clock.after(SIDEBAR_MS.dock + COLUMN_MS.slideSettled, () =>
			setKept((now) => ({ ...now, motion: "none" })),
		);
		return () => clock.cancelAfter(timer);
	}, [leaving, motion]);
	return { mounted: place !== "away" || leaving, leaving, shownAs, motion };
}

export { useSidebarSlide, type Place, type Slide };
