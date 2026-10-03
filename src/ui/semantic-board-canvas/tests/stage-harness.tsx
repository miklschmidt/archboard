// What a semantic pane does with what the server answers: the four states it
// can be in, the selection a click makes, and the camera — which neither a
// board changing under the person nor a failed refresh may disturb.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useEffect, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@/shared/code-target";
import { SemanticBoardStage, type SemanticPaneReading } from "@/ui/semantic-board-canvas";
import { withFixtureOrders } from "@/ui/semantic-board-canvas/tests/fixture-orders";

/** The window on the diagram every measured element reports in these tests. */
const VIEWPORT = Object.freeze({ width: 800, height: 600 });

/** The window the elements measure now: a test may narrow it, and each test starts from VIEWPORT. */
const room: { width: number; height: number } = { ...VIEWPORT };

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	// This DOM does no layout, and a camera cannot fit or zoom about nothing. The
	// size is given before anything mounts so that the stage's own first fit is
	// the one under test rather than a no-op that happens again later.
	/**
	 * How big an element is, in a DOM that does no layout.
	 * @returns The one window these tests measure everything through.
	 */
	function measured(): DOMRect {
		return new DOMRect(0, 0, room.width, room.height);
	}
	Element.prototype.getBoundingClientRect = measured;
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** What the fake server answers a request with. */
type Reply = { readonly status: number; readonly body: unknown } | "pending";

/**
 * The reply the next request gets, every request made so far, and the board
 * documents inspection reads.
 *
 * Documents are answered by name rather than by turn, because a pane inspecting
 * a drill-down reads two boards at once and which of them answers first is not
 * something a test should have to predict.
 */
const server: {
	reply: Reply;
	calls: string[];
	documents: Record<string, unknown>;
	/** Boards whose document is answered only once the promise settles. */
	held: Record<string, Promise<unknown>>;
	/** What the vault checker answers, or undefined for a checker that refuses. */
	vault: unknown;
} = { reply: "pending", calls: [], documents: {}, held: {}, vault: undefined };

const realFetch = globalThis.fetch;

afterEach(() => {
	cleanup();
	Object.assign(room, VIEWPORT);
	globalThis.fetch = realFetch;
	server.reply = "pending";
	server.calls = [];
	server.documents = {};
	server.held = {};
	server.vault = undefined;
});

/** The route the shared vault checker answers on. */
const VAULT_ROUTE = "/api/vault/check";

/** The route a pane reads a whole board through. */
const BOARD_ROUTE = "/api/semantic-boards/board";

/** The route a pane asks for a picture through. */
const RENDER_ROUTE = "/api/semantic-boards/render";

/**
 * Every picture the pane has asked for, in the order it asked.
 *
 * A pane reads two routes — the picture, and the board itself, for what a
 * picture does not carry — so a question about what was drawn is asked of the
 * render requests rather than of whichever request happened to be last.
 * @returns The render requests.
 */
function renderCalls(): string[] {
	return server.calls.filter((call) => call.startsWith(RENDER_ROUTE));
}

/**
 * The board a document request named.
 * @param url The request's URL.
 * @returns The board name, or null when the request was for something else.
 */
function documentAsked(url: string): string | null {
	return url.startsWith(BOARD_ROUTE)
		? (new URLSearchParams(url.split("?")[1]).get("board") ?? "")
		: null;
}

/**
 * One drawn board, with a card and an edge the atlas knows about and one group
 * it does not, so that "the atlas decides what is a subject" is observable.
 * Every subject carries the ring the renderer draws outside it — invisible
 * until a viewer lights it — because lighting it is how the pane says what is
 * selected, what a beat is about, and what is in dispute.
 * @param version The board version this drawing is of.
 * @param board Which board it is of; the pane's own by default.
 * @returns The render route's success body.
 */
function drawing(version: number, board = "pipeline"): Record<string, unknown> {
	return {
		success: true,
		board,
		version,
		variant: { id: "v1", name: "current", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg:
			`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
			`<g data-semantic-kind="node" data-semantic-id="n1">` +
			`<path class="ab-halo" id="card-halo"></path><rect id="card" width="80" height="40"></rect></g>` +
			`<g data-semantic-kind="edge" data-semantic-id="e1">` +
			`<path class="ab-halo" id="wire-halo"></path><path id="wire" d="M0 0 L10 10"></path></g>` +
			`<g data-semantic-kind="node" data-semantic-id="ghost"><rect id="stray"></rect></g>` +
			`</svg>`,
		atlas: {
			nodes: { n1: { x: 0, y: 0, width: 80, height: 40 } },
			edges: { e1: { x: 80, y: 20, width: 40, height: 2 } },
			regions: {},
		},
	};
}

/** A board that is there with nothing on it. */
const NOTHING_DRAWN = {
	status: 200,
	body: {
		success: true,
		board: "pipeline",
		version: 3,
		variant: { id: "v1", name: "current", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		empty: "NOTHING_TO_RENDER",
	},
} as const;

/** The vault has no such board. */
const NO_SUCH_BOARD = {
	status: 404,
	body: {
		success: false,
		code: "BOARD_MISSING",
		error: 'there is no semantic board called "pipeline"',
	},
} as const;

/** The board was there and has stopped being readable. */
const UNREADABLE = {
	status: 422,
	body: { success: false, code: "BOARD_UNREADABLE", error: "the board file is not valid JSON" },
} as const;

/**
 * The URL a request named, whichever way it was spelled.
 * @param input What the caller passed to fetch.
 * @returns The URL as a string.
 */
function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

/**
 * Answer every request from `server`, recording what was asked for.
 * @param input The request.
 * @returns The reply, or a promise that never settles while it is pending.
 */
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const url = urlOf(input);
	server.calls.push(url);
	const board = documentAsked(url);
	if (board !== null) {
		const held = server.held[board];
		return held === undefined
			? answered(documentReply(board))
			: held.then(() => answered(documentReply(board)));
	}
	if (url.startsWith(VAULT_ROUTE)) {
		return answered(
			server.vault === undefined
				? { status: 503, body: { success: false, error: "no checker" } }
				: { status: 200, body: server.vault },
		);
	}
	const reply = server.reply;
	return reply === "pending" ? new Promise<Response>(() => undefined) : answered(reply);
}

/**
 * What a document request for one board is answered with.
 * @param board The board asked for.
 * @returns The reply, refusing a board the test never put there.
 */
function documentReply(board: string): StubReply {
	const held = server.documents[board];
	if (held === undefined) {
		return {
			status: 404,
			body: {
				success: false,
				code: "BOARD_MISSING",
				error: `there is no semantic board called "${board}"`,
			},
		};
	}
	return { status: 200, body: { success: true, board: withFixtureOrders(held) } };
}

/** A reply the fake server is about to give. */
interface StubReply {
	/** Its HTTP status. */
	readonly status: number;
	/** Its body, before it is serialised. */
	readonly body: unknown;
}

/**
 * One reply, as a response.
 * @param reply Its status and body.
 * @returns The response.
 */
function answered(reply: StubReply): Promise<Response> {
	return Promise.resolve(
		new Response(JSON.stringify(reply.body), {
			status: reply.status,
			headers: { "Content-Type": "application/json" },
		}),
	);
}

/**
 * Let the answers in flight, and the reads they start, reach the screen. The
 * cache answers on real promises and tells its subscribers on a timer, so this
 * waits on the loop rather than on microtasks alone.
 * @returns Settles once the stage has rendered over whatever arrived.
 */
async function settle(): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	});
}

/** What one mounted stage told its caller. */
interface Mounted {
	/** Every selection the stage reported, in order. */
	readonly picks: (string | null)[];
}

/**
 * The stage inside a cache with this product's read defaults.
 * @param children The stage.
 * @returns The provider around it.
 */
function Cache(children: ReactNode): JSX.Element {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return createElement(QueryClientProvider, { client }, children);
}

/**
 * The fake wearing the one extra member the runtime's own `fetch` carries, so
 * it can stand in for it without an assertion.
 */
const serving: typeof fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });

/**
 * The stage's own props a test may state as they are: a driven step, what is
 * laid over the picture, and the boards above the one on screen.
 */
type StagePassThrough = Pick<
	Parameters<typeof SemanticBoardStage>[0],
	"driven" | "overlay" | "placeOf"
>;
/** What else a mounted pane may be told, beyond what it is showing. */
interface MountOptions extends StagePassThrough {
	/** Which view the pane reads its board through. */
	readonly view?: string | undefined;
	/**
	 * The pane offered a different way of reading the board.
	 * @param view The view's id, or null for the whole variant.
	 */
	readonly onViewChange?: ((view: string | null) => void) | undefined;
	/** Which variant of its board the pane is showing. */
	readonly variant?: string | undefined;
	/**
	 * The pane offered a different state of the architecture.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	readonly onVariantChange?: ((variant: string | null) => void) | undefined;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion?: boolean | undefined;
	/**
	 * Whether the selection is held above the pane and fed back to it, the way
	 * the shell holds it. Off by default, so a test that only wants to know what
	 * the pane reported sees a pane nothing moves under it.
	 */
	readonly live?: boolean | undefined;
	/**
	 * What the pane says it is reading, whenever that changes.
	 * @param reading The board, variant, view and selection on screen.
	 */
	readonly onReading?: ((reading: SemanticPaneReading) => void) | undefined;
	/**
	 * The person asked to open a part's code, which only a shell can do.
	 * @param binding Where the code is.
	 */
	readonly onOpenCode?: ((binding: CodeBinding) => void) | undefined;
}

/** Every option the harness passes straight through to the stage. */
const READING_PROPS = [
	"view",
	"onViewChange",
	"variant",
	"onVariantChange",
	"reducedMotion",
	"onReading",
	"onOpenCode",
	"driven",
	"overlay",
	"placeOf",
] as const satisfies readonly (keyof MountOptions)[];

/**
 * How the pane was told to read its board, as props the stage takes: assembled
 * once, so the two mount paths cannot differ in what they hand the stage.
 * @param options What the test asked for.
 * @returns The reading props, leaving out whatever was not asked for.
 */
function paneReading(options: MountOptions): Record<string, unknown> {
	const stated: Record<string, unknown> = {};
	for (const key of READING_PROPS) {
		const value = options[key];
		if (value !== undefined) {
			stated[key] = value;
		}
	}
	return stated;
}

/** A step the shell asks a pane to present. */
type Driven = MountOptions["driven"];

/**
 * The shell's hold on a held pane's variant, which the navigator changes, and
 * on the step it asks the pane to present, which a narration or an agent
 * starts: neither is the pane's own control, so a test changes them from here.
 */
const shellHold: {
	setVariant: ((variant: string | undefined) => void) | null;
	setDriven: ((driven: Driven) => void) | null;
} = {
	setVariant: null,
	setDriven: null,
};

/**
 * Show another state of the held pane's board, as choosing it in the navigator does.
 * @param variant The variant's id, or undefined for whichever is current.
 */
function chooseVariantInShell(variant: string | undefined): void {
	const set = shellHold.setVariant;
	if (set === null) {
		throw new Error("No held pane is mounted; mount with { live: true }.");
	}
	act(() => {
		set(variant);
	});
}

/**
 * Ask the held pane to present a step, as a narration started from the shell does.
 * @param driven The step.
 */
function driveInShell(driven: Driven): void {
	const set = shellHold.setDriven;
	if (set === null) {
		throw new Error("No held pane is mounted; mount with { live: true }.");
	}
	act(() => {
		set(driven);
	});
}

/**
 * Open one tab of the pane's sidebar, as a person does.
 * @param tab Which tab.
 */
function openSidebarTab(tab: "board" | "selection"): void {
	const trigger = document.querySelector<HTMLElement>(
		`[data-slot='semantic-sidebar-tab'][data-tab='${tab}']`,
	);
	if (trigger === null) {
		throw new Error(`The sidebar has no ${tab} tab.`);
	}
	act(() => {
		trigger.click();
	});
}

/** Inputs for the harness's own holder of a pane's selection. */
interface HeldProps extends MountOptions {
	/** What is picked out when it mounts. */
	readonly selection: string | null;
	/**
	 * Record what the person picked out.
	 * @param id The semantic id, or null.
	 */
	readonly report: (id: string | null) => void;
}

/**
 * A pane whose selection and variant are held above it, as the shell holds
 * them: the pane reports the person's choice and is given it back as a prop.
 * @param props What is picked out to begin with, and where to report picks.
 * @returns The pane.
 */
function Held(props: HeldProps): JSX.Element {
	const [picked, setPicked] = useState<string | null>(props.selection);
	const [variant, setVariant] = useState<string | undefined>(props.variant);
	const [view, setView] = useState<string | undefined>(props.view);
	const [driven, setDriven] = useState<Driven>(props.driven);
	useEffect(() => {
		shellHold.setVariant = setVariant;
		shellHold.setDriven = setDriven;
		return (): void => {
			shellHold.setVariant = null;
			shellHold.setDriven = null;
		};
	}, []);
	/**
	 * Take the pane's pick and feed it back to the pane.
	 * @param id The semantic id, or null.
	 */
	function onSelect(id: string | null): void {
		props.report(id);
		setPicked(id);
	}
	/**
	 * Take the pane's choice of state and feed it back to the pane.
	 * @param chosen The variant's id, or null for whichever is current.
	 */
	function onVariantChange(chosen: string | null): void {
		setVariant(chosen ?? undefined);
	}
	/**
	 * Read the chosen view, as the shell does.
	 * @param chosen The view, or null for Everything.
	 */
	function onViewChange(chosen: string | null): void {
		setView(chosen ?? undefined);
	}
	return createElement(SemanticBoardStage, {
		board: "pipeline",
		...paneReading(props),
		variant,
		onVariantChange,
		view,
		onViewChange,
		driven,
		selection: picked,
		onSelect,
	});
}

/**
 * Mount a semantic pane over the fake server.
 * @param selection What the shell says is picked out, if anything.
 * @param options The view it reads through, and what a choice reports to.
 * @returns What the pane reported.
 */
function mountStage(selection: string | null = null, options: MountOptions = {}): Mounted {
	globalThis.fetch = serving;
	const picks: (string | null)[] = [];
	/**
	 * Record what the person picked out.
	 * @param id The semantic id, or null.
	 */
	function onSelect(id: string | null): void {
		picks.push(id);
	}
	render(
		Cache(
			options.live === true
				? createElement(Held, { ...options, selection, report: onSelect })
				: createElement(SemanticBoardStage, {
						board: "pipeline",
						...paneReading(options),
						selection,
						onSelect,
					}),
		),
	);
	return { picks };
}

/**
 * What state the stage is in.
 * @returns The `data-state` of the stage, or null when nothing is mounted.
 */
function stageState(): string | null {
	return (
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state") ?? null
	);
}

/**
 * One element of the mounted stage.
 * @param slot The `data-slot` wanted.
 * @returns The element.
 */
function part(slot: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[data-slot='${slot}']`);
	if (element === null) {
		throw new Error(`The stage drew no ${slot}.`);
	}
	return element;
}

/**
 * The element the camera moves.
 * @returns The surface.
 */
function surface(): HTMLElement {
	return part("semantic-board-surface");
}

/**
 * The stage's tab stop: the element that hears the keys and the wheel.
 * @returns The viewport.
 */
function viewport(): HTMLElement {
	return part("semantic-board-viewport");
}

/**
 * The element inside the picture with this id.
 * @param id The id in the fake drawing's markup.
 * @returns The element.
 */
function inPicture(id: string): Element {
	const element = surface().querySelector(`#${id}`);
	if (element === null) {
		throw new Error(`The picture has no ${id}.`);
	}
	return element;
}

export {
	VIEWPORT,
	room,
	type MountOptions,
	settle,
	server,
	renderCalls,
	drawing,
	NOTHING_DRAWN,
	NO_SUCH_BOARD,
	UNREADABLE,
	chooseVariantInShell,
	driveInShell,
	mountStage,
	openSidebarTab,
	stageState,
	part,
	surface,
	viewport,
	inPicture,
	type Mounted,
};
