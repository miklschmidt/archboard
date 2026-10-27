// What a semantic pane does with what the server answers: the four states it
// can be in, the selection a click makes, and the camera — which neither a
// board changing under the person nor a failed refresh may disturb.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createElement, useEffect, useState, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import {
	type PaneChrome,
	PaneChromeContext,
} from "#ui/components/semantic-board-canvas/PaneChrome.tsx";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import { PaneVaultContext } from "#ui/state/semantic-board-canvas/pane-vault.ts";
import { SemanticBoardStage } from "#ui/components/semantic-board-canvas/SemanticBoardStage.tsx";
import { type SemanticPaneReading } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { withFixtureOrders } from "#tests/ui/support/semantic-board-canvas/fixture-orders.ts";

/** The window on the diagram every measured element reports in these tests. */
const VIEWPORT = Object.freeze({ width: 800, height: 600 });

/** The window the elements measure now: a test may narrow it, and each test starts from VIEWPORT. */
const room: { width: number; height: number } = { ...VIEWPORT };

/**
 * How big an element is, in a DOM that does no layout.
 * @returns The one window these tests measure everything through.
 */
function measured(): DOMRect {
	return new DOMRect(0, 0, room.width, room.height);
}

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	// This DOM does no layout, and a camera cannot fit or zoom about nothing. The
	// size is given before anything mounts so that the stage's own first fit is
	// the one under test rather than a no-op that happens again later.

	Element.prototype.getBoundingClientRect = measured;
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** What the fake server answers a request with. */
type Reply = { readonly status: number; readonly body: unknown } | "pending";

/** A server no code pass has run on yet. */
const NO_FINDINGS = { success: true, readings: [] } as const;

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
	/** What the last code pass left in the server's memory, as its route answers it. */
	findings: unknown;
} = {
	reply: "pending",
	calls: [],
	documents: {},
	held: {},
	vault: undefined,
	findings: NO_FINDINGS,
};

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
	server.findings = NO_FINDINGS;
});

/** The route the shared vault checker answers on. */
const VAULT_ROUTE = "/api/vault/check";

/** The route the findings of the last code pass are read from. */
const FINDINGS_ROUTE = "/api/vault/code-findings";

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
	if (url.startsWith(FINDINGS_ROUTE)) return answered({ status: 200, body: server.findings });
	return serverReply(url);
}

/**
 * Answer one request other than the findings from `server`, recording it.
 * @param url The request's URL.
 * @returns The reply, or a promise that never settles while it is pending.
 */
function serverReply(url: string): Promise<Response> {
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

/** The vault every mounted pane is in. */
const PANE_VAULT = "/work/archboard/.archboard/vault";

/**
 * The stage inside a cache with this product's read defaults, in one vault.
 * @param children The stage.
 * @returns The providers around it.
 */
function Cache(children: ReactNode): JSX.Element {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return createElement(
		QueryClientProvider,
		{ client },
		createElement(PaneVaultContext, { value: PANE_VAULT }, children),
	);
}

/**
 * The fake wearing the one extra member the runtime's own `fetch` carries, so
 * it can stand in for it without an assertion.
 */
const serving: typeof fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });

/**
 * The stage's own props a test may state as they are: a driven step, what is
 * laid over the picture, the boards above the one on screen, the shell's
 * narration, the search over parts, and what the shell hears the person changed.
 */
type StagePassThrough = Pick<
	Parameters<typeof SemanticBoardStage>[0],
	"driven" | "overlay" | "placeOf" | "narration" | "search" | "onUserChanged"
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
	/** What the shell puts in the pane's header; a pane alone in the shell by default. */
	readonly chrome?: PaneChrome | undefined;
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
	"narration",
	"search",
	"onUserChanged",
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
 * The shell's hold on a held pane's variant, which the navigator changes, on
 * the step it asks the pane to present, which a narration or an agent starts,
 * and on what it puts in the pane's header, which a second pane changes:
 * none is the pane's own control, so a test changes them from here.
 */
const shellHold: {
	setVariant: ((variant: string | undefined) => void) | null;
	setDriven: ((driven: Driven) => void) | null;
	setChrome: ((chrome: PaneChrome) => void) | null;
} = {
	setVariant: null,
	setDriven: null,
	setChrome: null,
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
 * Change what the shell puts in the held pane's header, as another pane opening beside it does.
 * @param chrome What the shell puts there now.
 */
function changeChromeInShell(chrome: PaneChrome): void {
	const set = shellHold.setChrome;
	if (set === null) {
		throw new Error("No held pane is mounted; mount with { live: true }.");
	}
	act(() => {
		set(chrome);
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
	const alone = usePaneChrome();
	const [chrome, setChrome] = useState(props.chrome);
	useEffect(() => {
		shellHold.setVariant = setVariant;
		shellHold.setDriven = setDriven;
		shellHold.setChrome = setChrome;
		return (): void => {
			shellHold.setVariant = null;
			shellHold.setDriven = null;
			shellHold.setChrome = null;
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
	return createElement(
		PaneChromeContext.Provider,
		{ value: chrome ?? alone },
		createElement(SemanticBoardStage, {
			board: "pipeline",
			...paneReading(props),
			variant,
			onVariantChange,
			view,
			onViewChange,
			driven,
			selection: picked,
			onSelect,
		}),
	);
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
	// A held pane puts its own header's contents in place, so that they can change.
	const stage =
		options.live === true
			? createElement(Held, { ...options, selection, report: onSelect })
			: createElement(SemanticBoardStage, {
					board: "pipeline",
					...paneReading(options),
					selection,
					onSelect,
				});
	const framed =
		options.live !== true && options.chrome !== undefined
			? createElement(PaneChromeContext.Provider, { value: options.chrome }, stage)
			: stage;
	render(Cache(framed));
	return { picks };
}

export {
	VIEWPORT,
	PANE_VAULT,
	room,
	type MountOptions,
	settle,
	server,
	renderCalls,
	chooseVariantInShell,
	changeChromeInShell,
	driveInShell,
	mountStage,
	openSidebarTab,
	type Mounted,
};

export {
	inPicture,
	part,
	stageState,
	surface,
	viewport,
} from "#tests/ui/support/semantic-board-canvas/stage-queries.ts";

export {
	NOTHING_DRAWN,
	NO_SUCH_BOARD,
	UNREADABLE,
	drawing,
} from "#tests/ui/support/semantic-board-canvas/render-answers.ts";
