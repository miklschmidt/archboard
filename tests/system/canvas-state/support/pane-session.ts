import type { WebSocket } from "ws";
import {
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.ts";
import { openObservedPane } from "../../support/observed-pane.ts";
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
	sync(): Promise<void>;
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
	const pane = await openObservedPane<PaneEvent>({
		base,
		clientId: options.clientId,
		preferredBoard: options.board,
		register: (board) =>
			request("/api/panes", {
				method: "POST",
				body: { ...registration, board },
				doing: false,
			}),
		readPanes: () => request("/api/panes"),
	});
	const waitForEvent = async (
		type: string,
		start = 0,
		timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS,
	) => {
		const deadline = Date.now() + timeoutMs;
		do {
			const found = pane.events.slice(start).find((event) => event.type === type);
			if (found) return found;
			await sleep(TEST_PANE_MESSAGE_POLL_MS);
		} while (Date.now() < deadline);
		return undefined;
	};
	return {
		clientId: options.clientId,
		socket: pane.socket,
		events: pane.events,
		registration,
		mark: () => pane.events.length,
		board: pane.board,
		register: async (board = options.board ?? pane.board() ?? "scratch") => pane.register(board),
		sync: pane.sync,
		waitFor: waitForEvent,
		close: pane.close,
	};
}
