// Traffic that stands still while a hand moves the camera, and wakes up gently.
//
// A drag, a wheel and a key move the picture, and a hand that moves it has no use
// for traffic that draws the eye. So the traffic of the picture stops with the first
// move and stays stopped for as long as the hand moves it. It comes back the moment a
// drag is let go, even if the picture is thrown and coasts on, and a moment after the
// last turn of a wheel or press of a key. It never returns at its speed: it starts as
// a creep and gathers it. What the stage moves itself, a fit or a glide to a step,
// leaves it alone.

import { useEffect, useMemo } from "react";

import { EXPLORING_MS } from "@/shared/timing/timing";
import { frameClock, paceTraffic } from "@/ui/frame-clock";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";

/**
 * Pace the traffic of the picture on a surface by what the camera is doing.
 * @param surface The element the picture is on, or null before there is one.
 * @param camera The camera that moves it.
 * @param dragging Whether a drag of the picture is under way, which keeps the traffic
 * still even while the pointer rests.
 */
function useTrafficRest(
	surface: HTMLElement | null,
	camera: Pick<BoardCamera, "subscribe" | "view">,
	dragging: boolean,
): void {
	const pace = useMemo(() => (surface === null ? null : paceTraffic(surface)), [surface]);
	// Whatever was held runs at its speed again when the picture goes away.
	useEffect(
		() => () => {
			pace?.release();
		},
		[pace],
	);

	const { subscribe, view } = camera;
	useEffect(() => {
		if (pace === null) return undefined;
		let waiting: number | null = null;
		/** Wait for the camera to be still, and then bring the traffic back. */
		const settle = (): void => {
			if (waiting !== null) frameClock().cancelAfter(waiting);
			waiting = frameClock().after(EXPLORING_MS.trafficRest, () => {
				waiting = null;
				pace.resume(EXPLORING_MS.trafficStart);
			});
		};
		// A drag holds the traffic even while the pointer rests, and lets it go as it ends.
		if (dragging) pace.hold();
		else pace.resume(EXPLORING_MS.trafficStart);
		const hearing = subscribe(() => {
			if (view().hand !== true) return;
			pace.hold();
			if (!dragging) settle();
		});
		return (): void => {
			hearing();
			if (waiting !== null) frameClock().cancelAfter(waiting);
		};
	}, [pace, subscribe, view, dragging]);
}

export { useTrafficRest };
