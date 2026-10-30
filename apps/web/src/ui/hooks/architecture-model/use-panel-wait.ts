import { useEffect, useState } from "react";
import { SIDEBAR_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";

const NOTHING: ReadonlySet<string> = new Set();

/**
 * What the right panel and the camera act on. A click lights its subject at once, and they wait,
 * so a double click lands on the card that its first click hit. Each new selection starts the
 * wait again, and a selection let go ends it.
 * @param ids The selected identities. A new set is a new pick, even of the same subjects.
 * @returns The selection once it has waited, and the last selection, which a leaving panel keeps.
 */
function usePanelWait(ids: ReadonlySet<string>): {
	readonly settled: ReadonlySet<string>;
	readonly last: ReadonlySet<string>;
} {
	const [settled, settle] = useState(NOTHING);
	const [last, keep] = useState(ids);
	if (ids.size === 0 && settled.size > 0) settle(NOTHING);
	if (ids.size > 0 && ids !== last) keep(ids);
	useEffect(() => {
		if (ids.size === 0) return undefined;
		const clock = frameClock();
		const timer = clock.after(SIDEBAR_MS.panelWait, () => settle(ids));
		return () => clock.cancelAfter(timer);
	}, [ids]);
	return { settled, last };
}

export { usePanelWait };
