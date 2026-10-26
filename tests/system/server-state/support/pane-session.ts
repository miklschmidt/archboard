import type { WebSocket } from "ws";
import { openObservedPane } from "../../support/observed-pane.ts";
import type { CapturedResponse, RequestOptions } from "./http.ts";

export interface PaneEvent {
	type: string;
	board?: string;
	requestId?: string;
	[key: string]: unknown;
}

type Request = (<T = unknown>(
	path: string,
	options?: RequestOptions,
) => Promise<CapturedResponse<T>>) & {
	/** The vault the requester names on every call, which the pane's socket names too. */
	readonly vault: string | undefined;
};

export interface PaneSession {
	readonly clientId: string;
	readonly socket: WebSocket;
	readonly events: PaneEvent[];
	readonly registration: Record<string, unknown>;
	mark(): number;
	board(): string | undefined;
	register(board?: string | null): Promise<void>;
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
		/** The board its socket names to start on. */
		startsOn?: string;
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
		rect: { x, y: 0, width: 640, height: 800 },
	};
	const pane = await openObservedPane<PaneEvent>({
		base,
		clientId: options.clientId,
		vault: requireVault(request.vault),
		...(options.startsOn === undefined ? {} : { startsOn: options.startsOn }),
		...(options.board === undefined ? {} : { preferredBoard: options.board }),
		register: (board, signal) =>
			request("/api/panes", {
				method: "POST",
				body: { ...registration, board },
				doing: false,
				signal,
			}),
		readPanes: (signal) => request("/api/panes", { signal }),
	});
	return {
		clientId: options.clientId,
		socket: pane.socket,
		events: pane.events,
		registration,
		mark: () => pane.events.length,
		board: pane.board,
		register: async (board = options.board ?? pane.board() ?? null) => pane.register(board),
		sync: pane.sync,
		waitFor: (type, start, timeoutMs) =>
			pane.waitFor((event) => event.type === type, start, timeoutMs),
		close: pane.close,
	};
}

function requireVault(vault: string | undefined): string {
	if (vault === undefined) {
		throw new Error("A pane belongs to a vault: open it through a requester that names one.");
	}
	return vault;
}
