import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { LibraryItems } from "@excalidraw/excalidraw/types";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";
import type { BrowserWorkbenchTransport } from "../../workbench-transport/index.js";
import type { CanvasSessionOptions } from "../useCanvasSession.js";
import type { PaneStatus } from "../../types/index.js";

registerHappyDom();
const { act, cleanup, render } = await loadRenderedUiTools();

await mock.module("@excalidraw/excalidraw", () => ({
	Excalidraw: () => <div data-excalidraw="mock" />,
	getLibraryItemsHash: () => 0,
}));

const FIRST_TRANSPORT = Object.freeze({}) as BrowserWorkbenchTransport;
const SECOND_TRANSPORT = Object.freeze({}) as BrowserWorkbenchTransport;
const EMPTY_LIBRARY_ITEMS: LibraryItems = [];
const publications: Array<readonly [string, BrowserWorkbenchTransport | null]> = [];
let currentTransport: BrowserWorkbenchTransport | null = FIRST_TRANSPORT;
let reportStatus: CanvasSessionOptions["onStatus"] | null = null;

function publishTransport(paneId: string, transport: BrowserWorkbenchTransport | null): void {
	publications.push([paneId, transport]);
}

const session = {
	attachExcalidraw: () => undefined,
	boardKey: null,
	attachPaneElement: () => undefined,
	connected: true,
	board: null,
	handleChange: () => undefined,
	markInteracted: () => undefined,
	readOnly: false,
	heldBy: null,
	takeBack: async () => ({ outcome: "success" as const }),
	doing: [],
	realtime: {},
	workbenchTransport: () => currentTransport,
};

const sessionUrl = new URL("../useCanvasSession.ts", import.meta.url).href;
await mock.module(sessionUrl, () => ({
	useCanvasSession(options: CanvasSessionOptions) {
		reportStatus = options.onStatus;
		return session;
	},
}));

const { CanvasPane } = await import("../CanvasPane.js");

afterEach(() => {
	cleanup();
	currentTransport = FIRST_TRANSPORT;
	reportStatus = null;
	publications.length = 0;
});
afterAll(unregisterHappyDom);

const STATUS: PaneStatus = {
	paneId: "pane-1",
	clientId: "pane-1-client",
	connected: true,
	board: null,
	boardKey: null,
	elementCount: 0,
	lastChangeAt: null,
	hold: null,
	writtenElsewhere: null,
	doing: [],
};

function noop(): void {}

test("publishes each production pane transport once, clears before replacement, and clears on unmount", () => {
	const view = render(
		<CanvasPane
			focused
			label="Pane A"
			libraryItems={EMPTY_LIBRARY_ITEMS}
			onAgentState={noop}
			onBoardError={noop}
			onCodeTargetNotice={noop}
			onFocus={noop}
			onLayoutRequest={noop}
			onLibraryChange={noop}
			onLibraryChangedElsewhere={noop}
			onPaneStateAccepted={noop}
			onPathFocusController={noop}
			onPathFocusSnapshot={noop}
			onPreviewController={noop}
			onSelectionSnapshot={noop}
			onStatus={noop}
			onThemeChange={noop}
			onWorkbenchTransport={publishTransport}
			paneId="pane-1"
			presentation={null}
			primary
			theme="light"
		/>,
	);

	if (reportStatus === null) throw new Error("CanvasPane did not connect its status reporter.");
	act(() => reportStatus?.(STATUS));
	act(() => reportStatus?.(STATUS));
	expect(publications).toEqual([["pane-1", FIRST_TRANSPORT]]);

	currentTransport = SECOND_TRANSPORT;
	act(() => reportStatus?.(STATUS));
	expect(publications).toEqual([
		["pane-1", FIRST_TRANSPORT],
		["pane-1", null],
		["pane-1", SECOND_TRANSPORT],
	]);

	view.unmount();
	expect(publications).toHaveLength(4);
	expect(publications.at(-1)).toEqual(["pane-1", null]);
});
