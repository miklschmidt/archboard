import { WebSocket } from "ws";

import {
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

export interface ObservedPaneEvent {
	type: string;
	board?: string;
	[key: string]: unknown;
}

interface RegistrationResponse {
	success?: boolean;
	registered?: boolean;
	paneCount?: number;
}

interface PanesResponse {
	panes?: Array<{ clientId?: string }>;
}

interface Response<T> {
	status: number;
	body: T;
}

export interface ObservedPane<Event extends ObservedPaneEvent> {
	readonly socket: WebSocket;
	readonly events: Event[];
	board(): string | undefined;
	register(board: string): Promise<void>;
	sync(): Promise<void>;
	close(): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function timeoutError(clientId: string, observation: string): Error {
	return new Error(
		`Timed out after ${TEST_PANE_MESSAGE_TIMEOUT_MS}ms waiting for pane ${clientId} ${observation}.`,
	);
}

export async function openObservedPane<Event extends ObservedPaneEvent>(options: {
	base: string;
	clientId: string;
	preferredBoard?: string;
	register: (board: string) => Promise<Response<RegistrationResponse>>;
	readPanes: () => Promise<Response<PanesResponse>>;
}): Promise<ObservedPane<Event>> {
	const endpoint = new URL(options.base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", options.clientId);
	const socket = new WebSocket(endpoint);
	const events: Event[] = [];
	let resolveInitial!: (event: Event) => void;
	let rejectInitial!: (error: Error) => void;
	const initial = new Promise<Event>((resolve, reject) => {
		resolveInitial = resolve;
		rejectInitial = reject;
	});
	const initialTimer = setTimeout(
		() => rejectInitial(timeoutError(options.clientId, "to receive initial_elements")),
		TEST_PANE_MESSAGE_TIMEOUT_MS,
	);
	const failInitial = (error: Error): void => rejectInitial(error);
	socket.on("message", (data) => {
		try {
			const event = JSON.parse(data.toString()) as Event;
			events.push(event);
			if (event.type === "initial_elements") resolveInitial(event);
		} catch (error) {
			rejectInitial(error as Error);
		}
	});
	socket.once("error", failInitial);
	socket.once("close", () =>
		failInitial(new Error(`Pane ${options.clientId} closed before its initial scene arrived.`)),
	);

	const register = async (board: string): Promise<void> => {
		const response = await options.register(board);
		if (response.status === 200 && response.body.success && response.body.registered) return;
		throw new Error(
			`Pane ${options.clientId} did not register: HTTP ${response.status}, ${JSON.stringify(response.body)}.`,
		);
	};
	try {
		const initialEvent = await initial.finally(() => clearTimeout(initialTimer));
		await register(options.preferredBoard ?? initialEvent.board ?? "scratch");
	} catch (error) {
		if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
		throw error;
	}

	let closedAndUnregistered = false;
	return {
		socket,
		events,
		board: () =>
			[...events]
				.toReversed()
				.find((event) => event.type === "initial_elements" || event.type === "board_switched")
				?.board,
		register,
		async sync() {
			if (socket.readyState !== WebSocket.OPEN) {
				throw new Error(`Pane ${options.clientId} cannot synchronize a closed socket.`);
			}
			const token = Buffer.from(`${options.clientId}:${events.length}:${Date.now()}`);
			await new Promise<void>((resolve, reject) => {
				const onPong = (data: Buffer): void => {
					if (!data.equals(token)) return;
					clearTimeout(timer);
					socket.off("pong", onPong);
					resolve();
				};
				const timer = setTimeout(() => {
					socket.off("pong", onPong);
					reject(timeoutError(options.clientId, "to acknowledge its socket barrier"));
				}, TEST_PANE_MESSAGE_TIMEOUT_MS);
				socket.on("pong", onPong);
				socket.ping(token);
			});
		},
		async close() {
			if (closedAndUnregistered) return;
			if (socket.readyState !== WebSocket.CLOSED) {
				await new Promise<void>((resolve) => {
					socket.once("close", () => resolve());
					socket.close();
				});
			}
			const deadline = Date.now() + TEST_PANE_MESSAGE_TIMEOUT_MS;
			do {
				const response = await options.readPanes();
				if (
					response.status === 200 &&
					!response.body.panes?.some((pane) => pane.clientId === options.clientId)
				) {
					closedAndUnregistered = true;
					return;
				}
				await sleep(TEST_PANE_MESSAGE_POLL_MS);
			} while (Date.now() < deadline);
			throw timeoutError(options.clientId, "to leave the pane registry");
		},
	};
}
