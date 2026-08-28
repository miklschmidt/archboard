import { WebSocket } from "ws";

import {
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
	TEST_PANE_SOCKET_SETTLE_MS,
} from "../../../../src/shared/timing/timing.ts";
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
	const endpoint = new URL(base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", clientId);
	const socket = new WebSocket(endpoint);
	const seen: PaneMessage[] = [];
	socket.on("message", (data) => seen.push(JSON.parse(data.toString()) as PaneMessage));
	await new Promise<void>((resolve, reject) => {
		socket.once("open", () => resolve());
		socket.once("error", reject);
	});
	await sleep(TEST_PANE_SOCKET_SETTLE_MS);
	const registration: PaneRegistration = {
		clientId,
		paneId: clientId,
		primary: options.primary ?? x === 0,
		focused: options.focused ?? false,
		elementCount: 0,
		rect: { x, y: 0, width: 640, height: 800 },
		viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
	};
	const board = (): string | undefined =>
		[...seen]
			.toReversed()
			.find((message) => message.type === "initial_elements" || message.type === "board_switched")
			?.board;
	const adopt = async (nextBoard: string): Promise<void> => {
		await request("/api/panes", {
			method: "POST",
			body: { ...registration, board: nextBoard },
		});
	};
	await adopt(options.board ?? board() ?? "scratch");
	return {
		clientId,
		socket,
		seen,
		registration,
		board,
		since: () => seen.length,
		adopt,
		async close() {
			if (socket.readyState === WebSocket.CLOSED) return;
			await new Promise<void>((resolve) => {
				socket.once("close", () => resolve());
				socket.close();
			});
		},
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
