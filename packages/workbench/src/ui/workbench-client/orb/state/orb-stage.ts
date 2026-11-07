// Where the orb is drawn: one canvas that lives in one of three homes and flies
// between them, as one shared element. The homes are the circle in the agent dock,
// the voice box over a pane's picture, and the gold circle of the Narrate key at the
// foot of a presented walkthrough's column.
//
// The orb is a canvas whose lines are a record of the last second of the model's
// output level, so it cannot be drawn twice: a second canvas would start dark and
// flat. It is made once, inside a holder, and the holder is what moves. A home
// offers a socket, an empty box that the holder sits in at rest. When the home that
// is wanted changes, the stage carries the holder from the socket it is in to the
// socket it is wanted in, in a layer over the page so that nothing clips it on the
// way, and puts it back in the socket on arrival. The canvas is never remounted,
// so its light and its history go with it. A home may offer more than one socket,
// as two presented panes each have a Narrate key: the newest is the home's, and the
// one before it is the home's again when it goes.
//
// The orb is the only one of its kind on the page at any moment, and so is the seat
// it has. The holder carries a plate of its own, and a home draws its seat only
// while the orb sits in it: the stage marks that socket occupied, and the stylesheet
// draws the dock's seat and the Narrate key's gold disc for it. So nothing that looks
// like the orb waits where it left or where it will land, and what is left behind is
// the room the orb had.
//
// A flight meets its socket where the socket is on every frame, not where it was,
// because a socket may itself be moving (the dock's plate is still forming, the
// voice box is still rising). A new wish during a flight turns it round from where
// the orb is. A socket that goes while the orb is in it, or flying to it, leaves
// the orb where it was, and the orb goes on from there to the next home that is
// offered, which may be offered in the same moment: a voice box that moves from one
// pane to another does not send the orb through the dock. The orb is cut in place of
// flown when motion is not wanted, when either end is not on screen, and when the
// socket it was heading for stops taking room on the page.
//
// A fullscreen presentation paints only the element presented, and nothing of the page outside it,
// so a flight crosses in that element, and a home that is outside it is not on screen: an orb is
// neither flown to it nor from it, but cut.
//
// A flight carries an orb that can be seen. One that is dark, or has only just been
// lit, is lit where it is wanted: voice started by Talk does not launch the orb out of
// the Talk key. The one exception is a launch, which a press of Narrate asks for: the
// next orb that is lit leaves the Narrate key it waits in, lit from the start of its
// flight, for the home it is wanted in. A launch leaves only for a home on screen, so
// while the home wanted is not, the orb waits in its key. The launch is spent once an
// orb is lit, and lost when its key goes.
//
// A dark orb fades where it is and waits in the home it is wanted in: a Narrate key's,
// while one is on the page, because voice is off and the key is where it starts again.
// One that is still seen in another home fades there, and moves once it is out of
// sight, which is when its fade ends. One in the air for the home it waits in lands
// lit, and fades there. When voice ends with the orb in the box and a Narrate key on
// the page, the dock wishes the orb into the key while the voice is ending and the orb
// is still lit, so the orb flies back to the key it came from, and fades in its seat
// however soon the voice is off. A holder moved in the same task as it is lit has no
// transition to run, so the stage lets its style settle between the two.

import { VOICE_MS } from "@archboard/timing";
import { flightAt, type Spot } from "#ui/workbench-client/orb/rules/orb-flight.ts";
import { SIZE } from "#ui/workbench-client/orb/clients/orb-painter.ts";
import {
	isDark,
	isDrawn,
	isLaunched,
	isOnScreen,
	isSeen,
	painted,
	placeInLayer,
	spotIn,
	spotOf,
} from "#ui/workbench-client/orb/clients/orb-screen.ts";

/**
 * The three places the orb lives: the circle in the agent dock, the voice box over a pane's
 * picture, and the gold circle of a presented walkthrough's Narrate key.
 */
type OrbHome = "dock" | "box" | "narrate";

/** What the holder is told after it has landed in a socket, so the orb can light the room it is in now. */
const ORB_MOVED = "voice-orb-moved";

/** Where the orb is wanted, and how it may get there. */
interface OrbWish {
	readonly home: OrbHome;
	/** Whether the orb is lit at all: voice is on. While it is not, the orb fades where it is and waits in a home. */
	readonly shown: boolean;
	/** Whether a change of home may be flown. */
	readonly fly: boolean;
}

/** What a stage asks of the page's frames. */
interface OrbFrames {
	/**
	 * Run something on the next frame.
	 * @param callback What to run, with the frame's time in milliseconds.
	 * @returns The request, to take back.
	 */
	readonly request: (callback: (time: number) => void) => number;
	/**
	 * Take back a request.
	 * @param request The request.
	 */
	readonly cancel: (request: number) => void;
}

/** The stage the orb is drawn on. */
interface OrbStage {
	/** What holds the orb's canvas: it is what moves, and what a portal draws the orb into. */
	readonly holder: HTMLElement;
	/**
	 * Put the stage's own elements in the page: the garage the holder waits in while no
	 * home is offered, and the layer a flight crosses in.
	 * @returns How to take them out again.
	 */
	readonly connect: () => () => void;
	/**
	 * Offer a socket as a home's place for the orb.
	 * @param home Which home.
	 * @param socket The empty box the holder sits in at rest.
	 * @returns How to withdraw it.
	 */
	readonly offer: (home: OrbHome, socket: HTMLElement) => () => void;
	/**
	 * Whether a home has offered a socket.
	 * @param home Which home.
	 * @returns True while it has.
	 */
	readonly offered: (home: OrbHome) => boolean;
	/**
	 * Hear about every socket offered or withdrawn.
	 * @param listener Called after each.
	 * @returns How to stop hearing.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * Say where the orb is wanted.
	 * @param wish The home, whether the orb shows, and whether it may fly.
	 */
	readonly wish: (wish: OrbWish) => void;
	/**
	 * Have the next orb that is lit leave the Narrate key it waits in, lit from the start of its
	 * flight. Nothing is asked while no Narrate key is on the page.
	 */
	readonly launch: () => void;
}

/** A flight in the air. */
interface Flight {
	readonly socket: HTMLElement;
	readonly from: Spot;
	/** The time of its first frame, or null before it. */
	start: number | null;
	request: number;
}

/** What a stage holds besides its holder. */
interface StageState {
	/** Each home's sockets, the newest last: the newest is the home's. */
	readonly sockets: Map<OrbHome, readonly HTMLElement[]>;
	readonly listeners: Set<() => void>;
	wish: OrbWish;
	/** The Narrate key's socket a press of Narrate asked to launch the orb from, until it is spent. */
	launch: HTMLElement | null;
	/** The socket the holder sits in, or null while it is in the garage or the air. */
	resting: HTMLElement | null;
	flight: Flight | null;
	/** Where the orb was last drawn in the air. */
	seen: Spot;
	/** Where the orb was when its socket went, until it flies on from there. */
	leftFrom: Spot | null;
	readonly garage: HTMLElement;
	readonly layer: HTMLElement;
}

/** The stacking of the layer a flight crosses in: over the page, under a tip or a menu. */
const LAYER_Z = 45;

/** The style a flight gives the holder, which a socket gives back to the stylesheet. */
const FLIGHT_STYLE = ["position", "left", "top", "translate", "transform"] as const;

/**
 * Where a lit orb goes, in order, when the home it is wanted in is not there. A lit orb never
 * falls back to a Narrate key: it is only wished there as voice ends.
 */
const HOMES_FOR: Readonly<Record<OrbHome, readonly OrbHome[]>> = {
	dock: ["dock", "box"],
	box: ["box", "dock"],
	narrate: ["narrate", "box", "dock"],
};

/** The page's own frames. */
const PAGE_FRAMES: OrbFrames = {
	/**
	 * The next frame of the page.
	 * @param callback What to run.
	 * @returns The request.
	 */
	request: (callback) => requestAnimationFrame(callback),
	/**
	 * Take back a frame.
	 * @param request The request.
	 */
	cancel: (request) => {
		cancelAnimationFrame(request);
	},
};

/**
 * One of the stage's own elements, which takes no pointer input.
 * @param tag What it is: a span where it may sit in a button, as the holder does in the dock's key.
 * @param name Its `data-slot`.
 * @param style What puts it where it goes.
 * @returns The element.
 */
function stageElement(
	tag: "div" | "span",
	name: string,
	style: Readonly<Record<string, string>>,
): HTMLElement {
	const element = document.createElement(tag);
	element.dataset["slot"] = name;
	Object.assign(element.style, { pointerEvents: "none", ...style });
	return element;
}

/**
 * A home's socket: the newest it offered.
 * @param state The stage.
 * @param home The home.
 * @returns The socket, or undefined while the home offers none.
 */
function socketOf(state: StageState, home: OrbHome): HTMLElement | undefined {
	return state.sockets.get(home)?.at(-1);
}

/**
 * The socket the wish is for. A lit orb goes to its home's, or to the next home's that is
 * offered. A dark orb waits in a Narrate key while one is on the page, and in its home otherwise.
 * @param state The stage.
 * @returns The socket, or undefined when no home is offered.
 */
function socketFor(state: StageState): HTMLElement | undefined {
	const { wish } = state;
	const waiting = wish.shown ? undefined : socketOf(state, "narrate");
	if (waiting !== undefined) return waiting;
	for (const home of HOMES_FOR[wish.home]) {
		const socket = socketOf(state, home);
		if (socket !== undefined) return socket;
	}
	return undefined;
}

/**
 * Whether the holder is in a socket, or on its way to it.
 * @param state The stage.
 * @param socket The socket.
 * @returns True when it is.
 */
function isBound(state: StageState, socket: HTMLElement): boolean {
	return state.flight === null ? state.resting === socket : state.flight.socket === socket;
}

/**
 * Whether the holder is in no home: in the garage, or left where its socket was when that went.
 * @param state The stage.
 * @returns True when it is neither in a socket nor in the air.
 */
function isHomeless(state: StageState): boolean {
	return state.resting === null && state.flight === null;
}

/**
 * Whether the orb may be flown to a socket: motion is wanted, the orb is lit and seen or launched,
 * and the socket is on screen.
 * @param state The stage.
 * @param holder The holder.
 * @param socket Where it would go.
 * @returns True when it may.
 */
function mayFly(state: StageState, holder: HTMLElement, socket: HTMLElement): boolean {
	const { wish } = state;
	const carried = isLaunched(holder) || isSeen(holder);
	return wish.fly && wish.shown && carried && isOnScreen(socket);
}

/**
 * Where the orb would leave from, or null when it is not on screen to leave: where it is in
 * the air, where its socket was when that went, or where it sits.
 * @param state The stage.
 * @param holder The holder.
 * @returns The spot.
 */
function departure(state: StageState, holder: HTMLElement): Spot | null {
	if (state.flight !== null) return state.seen;
	if (state.leftFrom !== null) return state.leftFrom;
	return state.resting === null ? null : spotIn(holder);
}

/**
 * The orb's holder and the elements its flights need, with no home yet.
 * @param frames What a flight runs on.
 * @returns The stage.
 */
function createOrbStage(frames: OrbFrames = PAGE_FRAMES): OrbStage {
	const holder = stageElement("span", "voice-orb-holder", {
		display: "block",
		width: `${SIZE}px`,
		height: `${SIZE}px`,
	});
	holder.style.setProperty("--voice-morph-ms", `${VOICE_MS.morph}ms`);
	holder.setAttribute("aria-hidden", "true");
	holder.dataset["shown"] = "false";
	const state: StageState = {
		sockets: new Map(),
		listeners: new Set(),
		wish: { home: "dock", shown: false, fly: false },
		launch: null,
		resting: null,
		flight: null,
		seen: { x: 0, y: 0, scale: 1 },
		leftFrom: null,
		garage: stageElement("div", "voice-orb-garage", {
			position: "fixed",
			left: "0",
			top: "0",
			width: "0",
			height: "0",
			overflow: "hidden",
			visibility: "hidden",
		}),
		layer: stageElement("div", "voice-orb-layer", {
			position: "fixed",
			inset: "0",
			zIndex: String(LAYER_Z),
		}),
	};
	state.garage.append(holder);

	/** Tell whoever listens that a socket was offered or withdrawn. */
	const notify = (): void => {
		for (const listener of state.listeners) listener();
	};

	/** Stop a flight's frames, leaving the holder where the last one drew it. */
	const stopFlight = (): void => {
		if (state.flight !== null) frames.cancel(state.flight.request);
		state.flight = null;
	};

	/** End any flight and give the holder back to the stylesheet, out of the layer. */
	const release = (): void => {
		stopFlight();
		for (const name of FLIGHT_STYLE) holder.style.removeProperty(name);
		delete holder.dataset["launched"];
		state.layer.remove();
	};

	/**
	 * Say which socket the holder rests in, or none, so that the stylesheet draws a home's
	 * seat only while the orb is in it.
	 * @param socket The socket, or null while the holder is in the air or the garage.
	 */
	const seat = (socket: HTMLElement | null): void => {
		if (state.resting !== null) delete state.resting.dataset["occupied"];
		state.resting = socket;
		if (socket !== null) socket.dataset["occupied"] = "";
	};

	/**
	 * Say whether the orb is lit, after the style it had where it now is has settled: a holder
	 * that was moved in this task has no style to change from, so its fade would not run. An orb
	 * that is not seen is put out first, so that it fades in where it has landed.
	 * @param fresh Whether the orb could not be seen before it was moved.
	 */
	const light = (fresh = false): void => {
		if (fresh) holder.dataset["shown"] = "false";
		void getComputedStyle(holder).opacity;
		holder.dataset["shown"] = String(state.wish.shown);
	};

	/**
	 * Put the holder in a socket, at rest.
	 * @param socket The socket.
	 */
	const land = (socket: HTMLElement): void => {
		const fresh = !isSeen(holder);
		release();
		state.leftFrom = null;
		seat(socket);
		socket.append(holder);
		light(fresh);
		holder.dispatchEvent(new Event(ORB_MOVED));
	};

	/** Put the holder in the garage, where no home is offered to hold it. */
	const park = (): void => {
		release();
		state.garage.append(holder);
		seat(null);
	};

	/**
	 * One frame of a flight.
	 * @param time The frame's time in milliseconds.
	 */
	const step = (time: number): void => {
		const { flight } = state;
		if (flight === null) return;
		flight.start ??= time;
		const rect = flight.socket.getBoundingClientRect();
		const progress = (time - flight.start) / VOICE_MS.flight;
		if (!isDrawn(rect) || progress >= 1) {
			land(flight.socket);
			return;
		}
		state.seen = flightAt(flight.from, spotOf(rect), progress);
		placeInLayer(holder, state.seen);
		flight.request = frames.request(step);
	};

	/**
	 * Carry the holder to a socket over the page.
	 * @param socket Where it is going.
	 * @param from Where it leaves.
	 */
	const fly = (socket: HTMLElement, from: Spot): void => {
		stopFlight();
		state.seen = from;
		state.leftFrom = null;
		seat(null);
		// A holder already in the air stays where it is in the page: moved, it would lose the fade it is in.
		if (holder.parentElement !== state.layer) state.layer.append(holder);
		const root = painted();
		if (state.layer.parentElement !== root) root.append(state.layer);
		placeInLayer(holder, from);
		light();
		state.flight = { socket, from, start: null, request: 0 };
		state.flight.request = frames.request(step);
	};

	/**
	 * Carry the holder to a socket: flown when it may be, cut when it may not.
	 * @param socket Where it is going.
	 */
	const carry = (socket: HTMLElement): void => {
		const from = mayFly(state, holder, socket) ? departure(state, holder) : null;
		if (from === null) land(socket);
		else fly(socket, from);
	};

	/**
	 * A dark orb fades where it is and waits in the home it is wanted in: it moves there at once
	 * when it is in no home or out of sight, and otherwise once its fade has ended. One in the air
	 * for that home lands lit, and fades there: a voice that ends while its orb flies home to the
	 * Narrate key does not lose the orb on the way.
	 * @param socket The home it waits in.
	 */
	const rest = (socket: HTMLElement): void => {
		state.leftFrom = null;
		if (state.flight?.socket === socket) return;
		holder.dataset["shown"] = "false";
		if (state.resting === socket) return;
		if (isHomeless(state) || isDark(holder)) land(socket);
	};

	/**
	 * Bring a lit orb to the socket it is wanted in. An orb that waits in the Narrate key a launch
	 * was asked from leaves it lit, once that socket is on screen to leave for, and the launch is
	 * spent with the lighting.
	 * @param socket The socket.
	 */
	const lightIn = (socket: HTMLElement): void => {
		const launching = state.launch !== null && state.resting === state.launch;
		if (launching && !isOnScreen(socket)) return;
		state.launch = null;
		if (launching) holder.dataset["launched"] = "";
		if (isBound(state, socket)) light();
		else carry(socket);
	};

	/** Bring the holder to where the wish says it should be. */
	const reconcile = (): void => {
		const socket = socketFor(state);
		if (socket === undefined) park();
		else if (!state.wish.shown) rest(socket);
		else lightIn(socket);
	};

	/**
	 * Take a socket back. An orb in it, or flying to it, is left where it was, to fly on from there,
	 * and a launch asked from it is lost.
	 * @param home Which home it was offered for.
	 * @param socket The socket.
	 */
	const withdraw = (home: OrbHome, socket: HTMLElement): void => {
		const offered = state.sockets.get(home) ?? [];
		if (!offered.includes(socket)) return;
		state.sockets.set(
			home,
			offered.filter((other) => other !== socket),
		);
		if (state.launch === socket) state.launch = null;
		if (isBound(state, socket)) {
			const was = state.flight === null ? spotIn(holder) : state.seen;
			park();
			state.leftFrom = was;
		}
		reconcile();
		notify();
	};

	/**
	 * The page went into or out of fullscreen: what it paints changed under a flight in the air, so
	 * the flight lands where it was going, and what is wanted next is worked out again from there.
	 */
	const settleFlight = (): void => {
		if (state.flight !== null) land(state.flight.socket);
	};

	/**
	 * The holder's fade ended: a dark orb is now out of sight, and goes on to the home it waits in.
	 * @param event The transition that ended, which may be one of the orb's own parts.
	 */
	const faded = (event: TransitionEvent): void => {
		if (event.target !== holder || event.propertyName !== "opacity") return;
		if (!state.wish.shown) reconcile();
	};
	holder.addEventListener("transitionend", faded);

	return {
		holder,
		/**
		 * Put the stage's elements in the page.
		 * @returns How to take them out.
		 */
		connect: () => {
			if (!state.garage.isConnected) document.body.append(state.garage);
			document.addEventListener("fullscreenchange", settleFlight);
			return (): void => {
				document.removeEventListener("fullscreenchange", settleFlight);
				stopFlight();
				state.layer.remove();
				state.garage.remove();
			};
		},
		/**
		 * Offer a socket as a home.
		 * @param home Which home.
		 * @param socket The socket.
		 * @returns How to withdraw it.
		 */
		offer: (home, socket) => {
			const others = (state.sockets.get(home) ?? []).filter((other) => other !== socket);
			state.sockets.set(home, [...others, socket]);
			reconcile();
			notify();
			return (): void => {
				withdraw(home, socket);
			};
		},
		/**
		 * Whether a home has offered a socket.
		 * @param home Which home.
		 * @returns True while it has.
		 */
		offered: (home) => socketOf(state, home) !== undefined,
		/**
		 * Hear about every socket offered or withdrawn.
		 * @param listener Called after each.
		 * @returns How to stop hearing.
		 */
		subscribe: (listener) => {
			state.listeners.add(listener);
			return (): void => {
				state.listeners.delete(listener);
			};
		},
		/**
		 * Say where the orb is wanted.
		 * @param wish Where, whether lit, and whether it may fly.
		 */
		wish: (wish) => {
			state.wish = wish;
			reconcile();
		},
		/** Have the next orb that is lit leave the Narrate key that is the home's now. */
		launch: () => {
			state.launch = socketOf(state, "narrate") ?? null;
		},
	};
}

export { ORB_MOVED, createOrbStage, type OrbFrames, type OrbHome, type OrbStage };
