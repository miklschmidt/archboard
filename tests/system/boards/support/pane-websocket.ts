import type { WebSocket } from "ws";

import { TEST_PANE_MESSAGE_TIMEOUT_MS } from "../../../../src/shared/timing/timing.ts";
import { openObservedPane } from "../../support/observed-pane.ts";
import type { JsonRequestOptions, JsonResponse } from "./http.ts";

export interface PaneMessage {
	type: string;
	board?: string;
	requestId?: string;
	[key: string]: unknown;
}

export interface PaneRegistration {
	clientId: string;
	paneId: string;
	board?: string;
	primary: boolean;
	focused: boolean;
	elementCount: number;
	rect: { x: number; y: number; width: number; height: number };
	viewport: { x: number; y: number; width: number; height: number; zoom: number };
}

type Request = <T>(path: string, options?: JsonRequestOptions) => Promise<JsonResponse<T>>;

export interface TestPane {
	readonly clientId: string;
	readonly socket: WebSocket;
	readonly seen: PaneMessage[];
	readonly registration: PaneRegistration;
	board(): string | undefined;
	since(): number;
	adopt(board: string): Promise<void>;
	waitFor(
		match: (message: PaneMessage) => boolean,
		start?: number,
		timeoutMs?: number,
	): Promise<PaneMessage | undefined>;
	close(): Promise<void>;
}

export async function openTestPane(
	base: string,
	request: Request,
	clientId: string,
	x: number,
	options: { primary?: boolean; focused?: boolean; board?: string } = {},
): Promise<TestPane> {
	const registration: PaneRegistration = {
		clientId,
		paneId: clientId,
		primary: options.primary ?? x === 0,
		focused: options.focused ?? false,
		elementCount: 0,
		rect: { x, y: 0, width: 640, height: 800 },
		viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
	};
	const pane = await openObservedPane<PaneMessage>({
		base,
		clientId,
		preferredBoard: options.board,
		register: (board, signal) =>
			request("/api/panes", {
				method: "POST",
				body: { ...registration, board },
				signal,
			}),
		readPanes: (signal) => request("/api/panes", { signal }),
	});
	return {
		clientId,
		socket: pane.socket,
		seen: pane.events,
		registration,
		board: pane.board,
		since: () => pane.events.length,
		adopt: pane.register,
		waitFor: pane.waitFor,
		close: pane.close,
	};
}

export async function waitForPaneMessage(
	pane: TestPane,
	start: number,
	type: string,
	timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS,
): Promise<PaneMessage | undefined> {
	return pane.waitFor((message) => message.type === type, start, timeoutMs);
}

export async function waitForPaneMessageWhere(
	pane: TestPane,
	start: number,
	match: (message: PaneMessage) => boolean,
	timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS,
): Promise<PaneMessage | undefined> {
	return pane.waitFor(match, start, timeoutMs);
}
