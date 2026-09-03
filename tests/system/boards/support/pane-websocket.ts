import type { WebSocket } from "ws";

import {
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.ts";
import { openObservedPane } from "../../support/observed-pane.ts";
import type { JsonResponse } from "./http.ts";

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

type Request = <T>(
	path: string,
	options?: { method?: string; body?: unknown; doing?: string },
) => Promise<JsonResponse<T>>;

export interface TestPane {
	readonly clientId: string;
	readonly socket: WebSocket;
	readonly seen: PaneMessage[];
	readonly registration: PaneRegistration;
	board(): string | undefined;
	since(): number;
	adopt(board: string): Promise<void>;
	close(): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
		register: (board) =>
			request("/api/panes", {
				method: "POST",
				body: { ...registration, board },
			}),
		readPanes: () => request("/api/panes"),
	});
	return {
		clientId,
		socket: pane.socket,
		seen: pane.events,
		registration,
		board: pane.board,
		since: () => pane.events.length,
		adopt: pane.register,
		close: pane.close,
	};
}

export async function waitForPaneMessage(
	pane: TestPane,
	start: number,
	type: string,
	timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS,
): Promise<PaneMessage | undefined> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = pane.seen.slice(start).find((message) => message.type === type);
		if (found) return found;
		await sleep(TEST_PANE_MESSAGE_POLL_MS);
	}
	return undefined;
}

export async function waitForPaneMessageWhere(
	pane: TestPane,
	start: number,
	match: (message: PaneMessage) => boolean,
	timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS,
): Promise<PaneMessage | undefined> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = pane.seen.slice(start).find(match);
		if (found) return found;
		await sleep(TEST_PANE_MESSAGE_POLL_MS);
	}
	return undefined;
}
