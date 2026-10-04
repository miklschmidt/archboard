// Where the orb is drawn: one canvas that lives in one of two homes and flies
// between them.
//
// The orb is a canvas whose lines are a record of the last second of the model's
// output level, so it cannot be drawn twice: a second canvas would start dark and
// flat. It is made once, inside a holder, and the holder is what moves. A home
// offers a socket, an empty box that the holder sits in at rest. When the home that
// is wanted changes, the stage carries the holder from the socket it is in to the
// socket it is wanted in, in a layer over the page so that nothing clips it on the
// way, and puts it back in the socket on arrival. The canvas is never remounted,
// so its light and its history go with it.
//
// A flight meets its socket where the socket is on every frame, not where it was,
// because a socket may itself be moving (the dock's plate is still forming, the
// voice box is still rising). A new wish during a flight turns it round from where
// the orb is. The orb is cut in place of flown when motion is not wanted, when
// either end is not on screen, when a presentation covers the page, and when the
// socket it was heading for goes while it is on its way.

import { VOICE_FLIGHT_MS } from "@/shared/timing/voice";
import { flightAt, type Spot } from "@/ui/voice-orb/lib/orb-flight";
import { SIZE } from "@/ui/voice-orb/lib/orb-painter";

/** The two places the orb lives: the circle in the agent dock, and the voice box over a pane's picture. */
type OrbHome = "dock" | "caption";

/** Where the orb is wanted, and how it may get there. */
interface OrbWish {
	readonly home: OrbHome;
	/** Whether the orb is lit at all: voice is on. While it is not, the orb fades where it is, and lights from the dock's circle. */
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
	 * Say where the orb is wanted.
	 * @param wish The home, whether the orb shows, and whether it may fly.
	 */
	readonly wish: (wish: OrbWish) => void;
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
	readonly sockets: Map<OrbHome, HTMLElement>;
	wish: OrbWish;
	/** The socket the holder sits in, or null while it is in the garage or the air. */
	resting: HTMLElement | null;
	flight: Flight | null;
	/** Where the orb was last drawn in the air. */
	seen: Spot;
	readonly garage: HTMLElement;
	readonly layer: HTMLElement;
}

/** The stacking of the layer a flight crosses in: over the page, under a tip or a menu. */
const LAYER_Z = 45;

/** The style a flight gives the holder, which a socket gives back to the stylesheet. */
const FLIGHT_STYLE = ["position", "left", "top", "translate", "transform"] as const;

/** Where the orb goes when the home it was wanted in is not there. */
const OTHER_HOME: Readonly<Record<OrbHome, OrbHome>> = { dock: "caption", caption: "dock" };

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
 * Whether a box takes room on the page.
 * @param rect The box.
 * @returns True when it has a width and a height.
 */
function isDrawn(rect: DOMRect): boolean {
	return rect.width > 0 && rect.height > 0;
}

/**
 * Whether a box is in the window, at least in part.
 * @param rect The box.
 * @returns True when it is.
 */
function isInView(rect: DOMRect): boolean {
	return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
}

/**
 * Whether a presentation has the page, with the dock and the voice box behind it.
 * @returns True while an element is fullscreen.
 */
function inFullscreen(): boolean {
	return "fullscreenElement" in document && document.fullscreenElement !== null;
}

/**
 * Where the middle of a box is.
 * @param rect The box.
 * @param scale How large the orb is drawn there.
 * @returns The spot.
 */
function spotOf(rect: DOMRect, scale: number): Spot {
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, scale };
}

/**
 * Draw the holder at a spot in the layer: fixed to the window, moved by a transform of its own.
 * @param holder The holder.
 * @param spot Where.
 */
function placeInLayer(holder: HTMLElement, spot: Spot): void {
	const half = SIZE / 2;
	Object.assign(holder.style, {
		position: "fixed",
		left: "0",
		top: "0",
		translate: "none",
		transform: `translate3d(${spot.x - half}px, ${spot.y - half}px, 0) scale(${spot.scale})`,
	});
}

/**
 * The socket the wish is for: its home's, or the other home's when that one is not offered.
 * @param state The stage.
 * @returns The socket, or undefined when no home is offered.
 */
function socketFor(state: StageState): HTMLElement | undefined {
	const { wish, sockets } = state;
	return sockets.get(wish.home) ?? sockets.get(OTHER_HOME[wish.home]);
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
 * Whether the orb may be flown to a socket: motion is wanted, the orb is lit, no
 * presentation covers the page, and the socket is on screen.
 * @param state The stage.
 * @param socket Where it would go.
 * @returns True when it may.
 */
function mayFly(state: StageState, socket: HTMLElement): boolean {
	const { wish } = state;
	return wish.fly && wish.shown && !inFullscreen() && isInView(socket.getBoundingClientRect());
}

/**
 * What the orb would leave from: where it is, or, when it is in no socket, the dock's circle,
 * which is where it lights from, unless that is where it is going.
 * @param state The stage.
 * @param holder The holder.
 * @param socket Where it is going.
 * @returns The element it leaves from, or undefined when it leaves from nowhere.
 */
function originOf(
	state: StageState,
	holder: HTMLElement,
	socket: HTMLElement,
): HTMLElement | undefined {
	if (state.resting !== null) return holder;
	const dock = state.sockets.get("dock");
	return dock === socket ? undefined : dock;
}

/**
 * Where an element is, as a spot, or null when it is not on screen to be left from or met.
 * @param element The element.
 * @param measured Whether the element is the orb's holder, whose size says how large the orb is
 * drawn: a socket is the size of the circle, and the orb is drawn at its own size in it.
 * @returns The spot.
 */
function spotIn(element: HTMLElement, measured: boolean): Spot | null {
	const rect = element.getBoundingClientRect();
	return isDrawn(rect) && isInView(rect) ? spotOf(rect, measured ? rect.width / SIZE : 1) : null;
}

/**
 * Where the orb would leave from, or null when it is not on screen to leave.
 * @param state The stage.
 * @param holder The holder.
 * @param socket Where it is going.
 * @returns The spot.
 */
function departure(state: StageState, holder: HTMLElement, socket: HTMLElement): Spot | null {
	if (state.flight !== null) return state.seen;
	const origin = originOf(state, holder, socket);
	if (origin === undefined) return null;
	return spotIn(origin, origin === holder);
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
	holder.setAttribute("aria-hidden", "true");
	holder.dataset["shown"] = "false";
	const state: StageState = {
		sockets: new Map(),
		wish: { home: "dock", shown: false, fly: false },
		resting: null,
		flight: null,
		seen: { x: 0, y: 0, scale: 1 },
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

	/** Stop a flight's frames, leaving the holder where the last one drew it. */
	const stopFlight = (): void => {
		if (state.flight !== null) frames.cancel(state.flight.request);
		state.flight = null;
	};

	/** End any flight and give the holder back to the stylesheet, out of the layer. */
	const release = (): void => {
		stopFlight();
		for (const name of FLIGHT_STYLE) holder.style.removeProperty(name);
		delete holder.dataset["flying"];
		state.layer.remove();
	};

	/** Say whether the orb is lit. */
	const mark = (): void => {
		holder.dataset["shown"] = String(state.wish.shown);
	};

	/**
	 * Put the holder in a socket, at rest.
	 * @param socket The socket.
	 */
	const land = (socket: HTMLElement): void => {
		release();
		socket.append(holder);
		state.resting = socket;
		mark();
	};

	/** Put the holder in the garage, where no home is offered to hold it. */
	const park = (): void => {
		release();
		state.garage.append(holder);
		state.resting = null;
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
		const progress = (time - flight.start) / VOICE_FLIGHT_MS;
		if (!isDrawn(rect) || progress >= 1) {
			land(flight.socket);
			return;
		}
		state.seen = flightAt(flight.from, spotOf(rect, 1), progress);
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
		state.resting = null;
		state.layer.append(holder);
		if (!state.layer.isConnected) document.body.append(state.layer);
		holder.dataset["flying"] = "";
		placeInLayer(holder, from);
		mark();
		state.flight = { socket, from, start: null, request: 0 };
		state.flight.request = frames.request(step);
	};

	/**
	 * Carry the holder to a socket: flown when it may be, cut when it may not.
	 * @param socket Where it is going.
	 */
	const carry = (socket: HTMLElement): void => {
		const from = mayFly(state, socket) ? departure(state, holder, socket) : null;
		if (from === null) land(socket);
		else fly(socket, from);
	};

	/** Bring the holder to where the wish says it should be. A dark orb fades where it is. */
	const reconcile = (): void => {
		const socket = socketFor(state);
		if (socket === undefined) park();
		else if (!state.wish.shown || isBound(state, socket)) mark();
		else carry(socket);
	};

	/**
	 * Take a socket back.
	 * @param home Which home it was offered for.
	 * @param socket The socket.
	 */
	const withdraw = (home: OrbHome, socket: HTMLElement): void => {
		if (state.sockets.get(home) !== socket) return;
		state.sockets.delete(home);
		if (isBound(state, socket)) park();
		reconcile();
	};

	return {
		holder,
		/**
		 * Put the stage's elements in the page.
		 * @returns How to take them out.
		 */
		connect: () => {
			if (!state.garage.isConnected) document.body.append(state.garage);
			return (): void => {
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
			state.sockets.set(home, socket);
			reconcile();
			return (): void => {
				withdraw(home, socket);
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
	};
}

export { createOrbStage, type OrbFrames, type OrbHome, type OrbStage, type OrbWish };
