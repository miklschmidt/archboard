import { WebSocket } from "ws";
import {
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
	TEST_PANE_SOCKET_SETTLE_MS,
} from "../../../../src/shared/timing/timing.ts";
import type { CapturedResponse, RequestOptions } from "./http.ts";
import { sleep } from "./http.ts";

export interface PaneEvent {
	type: string;
	board?: string;
	requestId?: string;
	[key: string]: unknown;
}

type Request = <T = unknown>(
	path: string,
	options?: RequestOptions,
) => Promise<CapturedResponse<T>>;

export interface PaneSession {
	readonly clientId: string;
	readonly socket: WebSocket;
	readonly events: PaneEvent[];
	readonly registration: Record<string, unknown>;
	mark(): number;
	board(): string | undefined;
	register(board?: string): Promise<void>;
	waitFor(type: string, start?: number, timeoutMs?: number): Promise<PaneEvent | undefined>;
	close(): Promise<void>;
}

export async function openPaneSession(
	base: string,
	request: Request,
	options: {
		clientId: string;
		x?: number;
		board?: string;
		primary?: boolean;
		focused?: boolean;
	},
): Promise<PaneSession> {
	const endpoint = new URL(base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", options.clientId);
	const socket = new WebSocket(endpoint);
	const events: PaneEvent[] = [];
	socket.on("message", (data) => events.push(JSON.parse(data.toString()) as PaneEvent));
	await new Promise<void>((resolve, reject) => {
		socket.once("open", resolve);
		socket.once("error", reject);
	});
	await sleep(TEST_PANE_SOCKET_SETTLE_MS);
	const x = options.x ?? 0;
	const registration = {
		clientId: options.clientId,
		paneId: options.clientId,
		primary: options.primary ?? x === 0,
		focused: options.focused ?? false,
		elementCount: 0,
		rect: { x, y: 0, width: 640, height: 800 },
		viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
	};
	const board = () =>
		[...events]
			.toReversed()
			.find((event) => event.type === "initial_elements" || event.type === "board_switched")?.board;
	const register = async (nextBoard = options.board ?? board() ?? "scratch") => {
		await request("/api/panes", {
			method: "POST",
			body: { ...registration, board: nextBoard },
			doing: false,
		});
	};
	const waitForEvent = async (
		type: string,
		start = 0,
		timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS,
	) => {
		const deadline = Date.now() + timeoutMs;
		do {
			const found = events.slice(start).find((event) => event.type === type);
			if (found) return found;
			await sleep(TEST_PANE_MESSAGE_POLL_MS);
		} while (Date.now() < deadline);
		return undefined;
	};
	await register(options.board);
	return {
		clientId: options.clientId,
		socket,
		events,
		registration,
		mark: () => events.length,
		board,
		register,
		waitFor: waitForEvent,
		async close() {
			if (socket.readyState === WebSocket.CLOSED) return;
			await new Promise<void>((resolve) => {
				socket.once("close", resolve);
				socket.close();
			});
		},
	};
}
