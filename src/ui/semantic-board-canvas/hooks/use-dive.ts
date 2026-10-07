// Flying into the board a card opens, and back out of it.
//
// Opening a card's board is not a cut to another picture. The board's picture
// is put inside the card, the camera flies into the card, and the board grows
// from the size of the card to the size of the pane; going back out runs the
// same flight the other way. The flight is the camera's own glide, so it runs on
// the frame clock. At its end the pane does what it has always done to open the
// board, and the board's own picture takes over from the one inside the card in
// the same commit, in the same place, with no entrance and no glide of its own
// (`cut`).
//
// Anything that could make the flight worse than the plain way is the plain
// way: reduced motion, a card with no box, a picture that is not to hand within
// a moment, a pane that moved on while it waited. A second request while one is
// under way ends the first at once, and is made the plain way itself.

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, type RefObject } from "react";

import { EXPLORING_MS } from "@/shared/timing/timing";
import { frameClock } from "@/ui/frame-clock";
import type {
	SemanticDrawing,
	SemanticRenderRequest,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import { CAMERA_MOTION_ATTRIBUTE } from "@/ui/semantic-board-canvas/hooks/use-camera-glide";
import { PICTURE_MOTION_ATTRIBUTE } from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
import type { Camera, Size } from "@/ui/semantic-board-canvas/lib/camera";
import { legInto, legOut, reached, type Leg } from "@/ui/semantic-board-canvas/lib/dive";
import {
	endOnInput,
	stageIn,
	startDive,
	type DiveWay,
	type Stage,
} from "@/ui/semantic-board-canvas/lib/picture-dive";
import { stagePicture } from "@/ui/semantic-board-canvas/lib/picture-transition";
import { semanticRenderQuery } from "@/ui/semantic-board-canvas/lib/queries";

/** What decides whether a flight can be made, and over what. */
interface DiveInputs {
	readonly camera: BoardCamera;
	/** The picture's area, which holds the camera's viewport and its surface. */
	readonly area: RefObject<HTMLElement | null>;
	/** The picture on screen, or null. */
	readonly drawn: SemanticDrawing | null;
	/** How the pane asks for a picture, besides which board. */
	readonly reading: Pick<SemanticRenderRequest, "comparison" | "layout">;
	/** Whether the person asked for no motion, which makes every move a cut. */
	readonly reducedMotion: boolean;
	/** Whether a walkthrough is presented: its step says what the picture is about, and nothing flies over it. */
	readonly presenting: boolean;
}

/** Which board a flight goes to, and the variant and view the pane will read it through. */
type Destination = Pick<SemanticRenderRequest, "board" | "variant" | "view">;

/** What the pane can be asked to fly. */
interface Flier {
	/** Whether the picture on screen is the one a flight arrived at: it took over from the board inside the card, with no entrance of its own. */
	readonly cut: boolean;
	/**
	 * Open the board a card opens, flying into the card when that can be done.
	 * @param card The card, or null when the opening is not from one.
	 * @param to The board and the variant it is opened at.
	 * @param proceed What opens the board the plain way, which the flight ends with.
	 */
	readonly into: (card: string | null, to: Destination, proceed: () => void) => void;
	/**
	 * Go back to the board above, flying out of the card that opened this one when that can be done.
	 * @param to The board above, and how the pane will read it.
	 * @param proceed What goes back the plain way, which the flight ends with.
	 */
	readonly out: (to: Destination, proceed: () => void) => void;
}

/** One request for a flight, from the moment it is made until the pane has taken over. */
interface Run {
	/** Whether it has ended: the pane took over, or it ended the plain way. */
	over: boolean;
	/** The picture the pane showed when it was made. */
	readonly at: SemanticDrawing;
	/** What opens or goes back the plain way. */
	readonly proceed: () => void;
	/** Give the surface back, once the flight is in the air. */
	stop: () => void;
}

/** What a flight is made of, once the other board's picture is to hand. */
interface Plan {
	/** The card the board is inside. */
	readonly card: string;
	readonly leg: Leg;
	/** The picture that sits inside the card. */
	readonly child: SemanticDrawing;
	/** The picture the surface holds for the flight when it is not the one on it. */
	readonly standing: string | null;
}

/** A request to fly: over which picture, which way, to what, and how to plan it. */
interface Trip {
	readonly at: SemanticDrawing;
	readonly way: DiveWay;
	readonly request: SemanticRenderRequest;
	/**
	 * Work out the flight.
	 * @param other The picture of the board flown to.
	 * @param room How big the pane's window on the diagram is.
	 * @param seen Where the camera is.
	 * @returns The plan, or null when the card is not drawn.
	 */
	readonly plan: (other: SemanticDrawing, room: Size, seen: Camera) => Plan | null;
}

/** The pane as a flight finds it. */
interface Ground {
	readonly stage: Stage;
	readonly room: Size;
}

/** A flight about to take off. */
interface Takeoff extends Plan {
	readonly stage: Stage;
	readonly camera: BoardCamera;
	readonly way: DiveWay;
}

/** Do nothing. */
function nothing(): void {}

/**
 * Hear the camera's glide end.
 * @param surface The surface, which carries a mark while the camera glides.
 * @param then What to do once it has.
 * @returns Stop listening.
 */
function whenLanded(surface: HTMLElement, then: () => void): () => void {
	if (!surface.hasAttribute(CAMERA_MOTION_ATTRIBUTE)) {
		then();
		return nothing;
	}
	const observer = new MutationObserver(() => {
		if (!surface.hasAttribute(CAMERA_MOTION_ATTRIBUTE)) {
			observer.disconnect();
			then();
		}
	});
	observer.observe(surface, { attributes: true, attributeFilter: [CAMERA_MOTION_ATTRIBUTE] });
	return () => observer.disconnect();
}

/**
 * Put the board inside its card and fly the camera to the end of the flight.
 *
 * The camera counts as the reader's while it flies, so the pane does not fit it
 * again when its size changes on the way. If something moves it off its course
 * anyway, the flight is given up and the board opens the plain way.
 *
 * The flight holds the camera's rest from takeoff (TASK-406). The far view of
 * the surface stays as it was, so no card swaps its words for its name, or
 * back, in the air. The board inside the card is drawn the same way, and so is
 * the board that takes over from it. The hold ends once the pane has taken over,
 * and the far view then follows the board's own fit, once.
 * @param takeoff The flight, and what it flies over.
 * @param land Hand the pane over, once the camera has arrived, with the hold to let go once the pane has taken over.
 * @param giveUp End the flight the plain way, when the camera did not arrive.
 * @returns How to give the surface back before that, or null when it could not take off.
 */
function fly(
	takeoff: Takeoff,
	land: (letGo: () => void) => void,
	giveUp: () => void,
): (() => void) | null {
	const { stage, camera, leg } = takeoff;
	const letGo = camera.hold();
	if (takeoff.standing !== null) stagePicture(stage.surface, takeoff.standing);
	if (leg.from !== null) camera.glide(leg.from, 0, false);
	const dive = startDive(stage.surface, takeoff.child, leg.inset, takeoff.way, takeoff.card);
	if (dive === null) {
		letGo();
		return null;
	}
	const stops: (() => void)[] = [];
	let landed = false;
	/** Let go of everything the flight listens to or holds. */
	const release = (): void => {
		for (const stop of stops.splice(0)) stop();
	};
	/** The camera has stopped: at the end of the flight, or somewhere it was sent instead. */
	const arrive = (): void => {
		if (landed) return;
		landed = true;
		release();
		if (reached(camera.view().camera, leg.to)) land(letGo);
		else giveUp();
	};
	stage.surface.style.pointerEvents = "none";
	stops.push(
		() => {
			stage.surface.style.pointerEvents = "";
		},
		endOnInput(stage.viewport, () => {
			camera.glide(leg.to, 0, false);
		}),
	);
	if (!camera.glide(leg.to, EXPLORING_MS.dive, true)) {
		release();
		dive.cancel();
		letGo();
		return null;
	}
	stops.push(whenLanded(stage.surface, arrive));
	return (): void => {
		landed = true;
		release();
		dive.cancel();
		letGo();
	};
}

/**
 * The picture of a board, when it is to hand within a moment.
 * @param client The tab's cache.
 * @param request The board, variant and reading.
 * @returns The picture, or null.
 */
async function pictureOf(
	client: QueryClient,
	request: SemanticRenderRequest,
): Promise<SemanticDrawing | null> {
	const clock = frameClock();
	let timer = 0;
	const late = new Promise<null>((resolve) => {
		timer = clock.after(EXPLORING_MS.divePrefetch, () => resolve(null));
	});
	const read = client.fetchQuery(semanticRenderQuery(request)).catch(() => null);
	try {
		const answer = await Promise.race([read, late]);
		return answer?.kind === "drawn" ? answer : null;
	} finally {
		clock.cancelAfter(timer);
	}
}

/**
 * Whether the reader, or what the pane is showing, leaves no room for a flight.
 * @param now What decides whether a flight can be made.
 * @returns True for no motion asked for, a presented walkthrough, or no frames to fly on.
 */
function holdsStill(now: DiveInputs): boolean {
	return now.reducedMotion || now.presenting || !frameClock().animates;
}

/**
 * The pane as a flight would find it: with room, motion allowed and a picture to fly over.
 *
 * Not while a picture is still coming in or being carried. When that flight
 * lands it writes the picture to the surface again, which would take the board
 * inside the card away in the middle of the dive.
 * @param now What decides whether a flight can be made.
 * @returns The stage and its room, or null.
 */
function groundOf(now: DiveInputs): Ground | null {
	const stage = stageIn(now.area.current);
	// The size the stage has now, as the fit that takes over from the flight will find it.
	const room = now.camera.measure();
	if (holdsStill(now) || stage === null || room === null) {
		return null;
	}
	return stage.surface.hasAttribute(PICTURE_MOTION_ATTRIBUTE) ? null : { stage, room };
}

/**
 * The key a card is remembered under: the board above it and the board it opens.
 * @param parent The board the card is in.
 * @param child The board it opens.
 * @returns The key, the same for any spelling of the two names.
 */
function keyOf(parent: string, child: string): string {
	return JSON.stringify([parent.toLowerCase(), child.toLowerCase()]);
}

/** What the hook's owner drives a pane's flights with. */
interface Flights {
	readonly into: Flier["into"];
	readonly out: Flier["out"];
	/**
	 * The pane as it is after a render: a flight over a picture that is gone ends where it is.
	 * @param inputs The latest inputs.
	 */
	readonly update: (inputs: DiveInputs) => void;
	/** The pane is going away. */
	readonly dispose: () => void;
}

/**
 * The flights of one pane.
 * @param client The tab's cache.
 * @param first The pane as it is when it first renders.
 * @param handed Told when the pane takes over from a flight, with the picture it takes over from.
 * @returns The two flights, and the two things the pane tells them.
 */
function createFlights(
	client: QueryClient,
	first: DiveInputs,
	handed: (from: SemanticDrawing | null) => void,
): Flights {
	let pane = first;
	let run: Run | null = null;
	// A flight that has arrived holds the camera's rest until the pane has taken
	// over from the picture it flew over: what lets the hold go, and that picture.
	let landing: { readonly letGo: () => void; readonly from: SemanticDrawing | null } | null = null;
	// Which card of a board opened which board, so that going back knows what to fly out of.
	const cards = new Map<string, string>();

	/** Let go of the hold of a flight that has arrived, if one is still held. */
	function letGoOfLanding(): void {
		landing?.letGo();
		landing = null;
	}

	/**
	 * End a request the plain way, at once: take what it put on the surface away and do what it was for.
	 * @param one The request.
	 */
	function settle(one: Run): void {
		if (one.over) return;
		one.over = true;
		if (run === one) run = null;
		one.stop();
		one.proceed();
	}

	/**
	 * The pane takes over from a flight that has arrived.
	 * @param one The request.
	 * @param letGo Let go of the flight's hold on the camera's rest, once the pane has taken over.
	 */
	function handOver(one: Run, letGo: () => void): void {
		if (one.over) {
			letGo();
			return;
		}
		one.over = true;
		if (run === one) run = null;
		letGoOfLanding();
		landing = { letGo, from: pane.drawn };
		handed(pane.drawn);
		one.proceed();
	}

	/**
	 * End the request under way, if there is one.
	 * @returns Whether there was.
	 */
	function endRun(): boolean {
		letGoOfLanding();
		const under = run;
		if (under !== null) settle(under);
		return under !== null;
	}

	/**
	 * Where a request can fly, when the pane is still as the request found it.
	 * @param mine The request.
	 * @param trip What to fly.
	 * @returns The stage and its room, or null.
	 */
	function groundFor(mine: Run, trip: Trip): Ground | null {
		return !mine.over && pane.drawn === trip.at ? groundOf(pane) : null;
	}

	/**
	 * What a flight is made of, when the other board's picture is to hand and the pane is as the request found it.
	 * @param mine The request.
	 * @param trip What to fly.
	 * @param other The picture of the board flown to, or null when it was not to hand.
	 * @returns The flight and what it flies over, or null when it cannot be made.
	 */
	function takeoffFor(mine: Run, trip: Trip, other: SemanticDrawing | null): Takeoff | null {
		const ground = groundFor(mine, trip);
		const plan =
			ground === null || other === null
				? null
				: trip.plan(other, ground.room, pane.camera.view().camera);
		return ground === null || plan === null
			? null
			: { ...plan, stage: ground.stage, camera: pane.camera, way: trip.way };
	}

	/**
	 * Take off, when the flight can be made.
	 * @param mine The request.
	 * @param trip What to fly.
	 * @param other The picture of the board flown to, or null when it was not to hand.
	 * @returns How to give the surface back, or null when the flight cannot be made.
	 */
	function takeOff(mine: Run, trip: Trip, other: SemanticDrawing | null): (() => void) | null {
		const takeoff = takeoffFor(mine, trip, other);
		return takeoff === null
			? null
			: fly(
					takeoff,
					(letGo) => {
						handOver(mine, letGo);
					},
					() => {
						settle(mine);
					},
				);
	}

	/**
	 * Fly, once the other board's picture is to hand.
	 * @param mine The request.
	 * @param trip What to fly.
	 */
	async function fetchAndFly(mine: Run, trip: Trip): Promise<void> {
		const other = await pictureOf(client, trip.request);
		const stop = takeOff(mine, trip, other);
		if (stop === null) {
			settle(mine);
			return;
		}
		mine.stop = stop;
	}

	/**
	 * Make a request for a flight.
	 * @param trip What to fly.
	 * @param proceed What opens or goes back the plain way.
	 */
	function begin(trip: Trip, proceed: () => void): void {
		if (groundOf(pane) === null) {
			proceed();
			return;
		}
		const mine: Run = { over: false, at: trip.at, proceed, stop: nothing };
		run = mine;
		// A flight that fails in a way nobody foresaw is the plain way, so the card still opens.
		fetchAndFly(mine, trip).catch(() => {
			settle(mine);
		});
	}

	/**
	 * Open the board a card opens, flying into the card when that can be done.
	 * @param card The card, or null when the opening is not from one.
	 * @param to The board and the variant it is opened at.
	 * @param proceed What opens the board the plain way.
	 */
	function into(card: string | null, to: Destination, proceed: () => void): void {
		const at = pane.drawn;
		if (endRun() || at === null || card === null) {
			proceed();
			return;
		}
		cards.set(keyOf(at.board, to.board), card);
		/**
		 * The flight into the card, once the board's picture is to hand.
		 * @param child The picture of the board the card opens.
		 * @param room How big the pane's window on the diagram is.
		 * @returns The plan, or null when the card is not drawn.
		 */
		const plan: Trip["plan"] = (child, room) => {
			const leg = legInto(at, card, child, room);
			return leg === null ? null : { card, leg, child, standing: null };
		};
		begin({ at, way: "in", request: { ...to, ...pane.reading }, plan }, proceed);
	}

	/**
	 * Go back to the board above, flying out of the card that opened this one when that can be done.
	 * @param to The board above, and how the pane will read it.
	 * @param proceed What goes back the plain way.
	 */
	function out(to: Destination, proceed: () => void): void {
		const child = pane.drawn;
		const card = child === null ? undefined : cards.get(keyOf(to.board, child.board));
		if (endRun() || child === null || card === undefined) {
			proceed();
			return;
		}
		/**
		 * The flight out of the card, once the picture of the board above is to hand.
		 * @param parent The picture of the board above.
		 * @param room How big the pane's window on the diagram is.
		 * @param seen Where the camera is.
		 * @returns The plan, or null when the card is not drawn.
		 */
		const plan: Trip["plan"] = (parent, room, seen) => {
			const leg = legOut(parent, card, child, room, seen);
			return leg === null ? null : { card, leg, child, standing: parent.svg };
		};
		begin({ at: child, way: "out", request: { ...to, ...pane.reading }, plan }, proceed);
	}

	/**
	 * Take the pane as it is after a render. A flight over a picture that is gone
	 * ends where it is, and a flight that has arrived lets go of the camera's rest
	 * once the pane shows another picture: the board it flew to, fitted.
	 * @param inputs The latest inputs.
	 */
	function update(inputs: DiveInputs): void {
		pane = inputs;
		if (run !== null && run.at !== inputs.drawn) settle(run);
		if (landing !== null && landing.from !== inputs.drawn) letGoOfLanding();
	}

	/** Let go of a flight in the air, of the surface it holds, and of any hold on the camera. */
	function dispose(): void {
		letGoOfLanding();
		if (run === null) return;
		run.over = true;
		run.stop();
		run = null;
	}

	return { into, out, update, dispose };
}

/** The pane has taken over from a flight: from which picture, and which it arrived at. */
interface Handover {
	readonly from: SemanticDrawing | null;
	/** The picture of the board flown to, once it is on screen; undefined until then. */
	readonly to?: SemanticDrawing | null;
}

/**
 * What a hand-over has become, given the picture on screen now: it ends when
 * the picture it arrived at is replaced by another.
 * @param handover The hand-over, or null when there is none.
 * @param drawn The picture on screen.
 * @returns The same hand-over, or the arrival noted on it, or null.
 */
function followed(handover: Handover | null, drawn: SemanticDrawing | null): Handover | null {
	if (handover === null) {
		return null;
	}
	if (handover.to === undefined) {
		return drawn === handover.from ? handover : { from: handover.from, to: drawn };
	}
	return drawn === handover.to ? handover : null;
}

/**
 * Fly into the board a card opens, and out of it again.
 * @param inputs The camera, the picture's area, the picture on screen and how pictures are asked for.
 * @returns Whether the next picture takes over from a flight, and the two flights.
 */
function useDive(inputs: DiveInputs): Flier {
	const client = useQueryClient();
	const [handover, setHandover] = useState<Handover | null>(null);
	const [flights] = useState(() =>
		createFlights(client, inputs, (from) => {
			setHandover({ from });
		}),
	);
	// The board flown to takes over from the flight in the commit it is first drawn in, and later pictures arrive the plain way.
	const current = followed(handover, inputs.drawn);
	if (current !== handover) setHandover(current);
	// The pane as it is, for a flight asked for between renders; a picture that changed under a flight ends it.
	useEffect(() => {
		flights.update(inputs);
	});
	useEffect(() => flights.dispose, [flights]);
	return { cut: current !== null, into: flights.into, out: flights.out };
}

export { useDive, type Destination, type Flier };
