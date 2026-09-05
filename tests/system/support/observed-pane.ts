import { WebSocket, type RawData } from "ws";

import {
	TEST_PANE_MESSAGE_POLL_MS,
	TEST_PANE_MESSAGE_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

export interface ObservedPaneEvent {
	type: string;
	board?: string;
	[key: string]: unknown;
}

interface Response {
	status: number;
	body: unknown;
}

export interface ObservedPane<Event extends ObservedPaneEvent> {
	readonly socket: WebSocket;
	readonly events: Event[];
	board(): string | undefined;
	register(board: string): Promise<void>;
	waitFor(
		match: (event: Event) => boolean,
		start?: number,
		timeoutMs?: number,
	): Promise<Event | undefined>;
	sync(): Promise<void>;
	close(): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function paneEntry(value: unknown): value is { clientId: string } {
	return record(value) && typeof value["clientId"] === "string";
}

function timeoutError(clientId: string, observation: string, timeoutMs: number): Error {
	return new Error(`Timed out after ${timeoutMs}ms waiting for pane ${clientId} ${observation}.`);
}

async function bounded<T>(
	clientId: string,
	observation: string,
	timeoutMs: number,
	operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	let timer!: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			const error = timeoutError(clientId, observation, timeoutMs);
			controller.abort(error);
			reject(error);
		}, timeoutMs);
	});
	try {
		return await Promise.race([operation(controller.signal), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

async function closeSocket(socket: WebSocket, clientId: string, timeoutMs: number): Promise<void> {
	if (socket.readyState === WebSocket.CLOSED) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const cleanup = (): void => {
			clearTimeout(timer);
			socket.off("close", onClose);
		};
		const onClose = (): void => {
			cleanup();
			resolve();
		};
		const timer = setTimeout(() => {
			cleanup();
			if (socket.readyState !== WebSocket.CLOSED) {
				socket.terminate();
			}
			reject(timeoutError(clientId, "to close its socket", timeoutMs));
		}, timeoutMs);
		socket.once("close", onClose);
		try {
			socket.close();
		} catch (error) {
			cleanup();
			if (socket.readyState !== WebSocket.CLOSED) {
				socket.terminate();
			}
			reject(error as Error);
		}
	});
}

export async function openObservedPane<Event extends ObservedPaneEvent>(options: {
	base: string;
	clientId: string;
	preferredBoard?: string;
	register: (board: string, signal: AbortSignal) => Promise<Response>;
	readPanes: (signal: AbortSignal) => Promise<Response>;
}): Promise<ObservedPane<Event>> {
	const endpoint = new URL(options.base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", options.clientId);
	const socket = new WebSocket(endpoint);
	const events: Event[] = [];
	let resolveInitial!: (event: Event) => void;
	let rejectInitial!: (error: Error) => void;
	let initialArrived = false;
	const initial = new Promise<Event>((resolve, reject) => {
		resolveInitial = resolve;
		rejectInitial = reject;
	});
	const initialTimer = setTimeout(
		() =>
			rejectInitial(
				timeoutError(options.clientId, "to receive initial_elements", TEST_PANE_MESSAGE_TIMEOUT_MS),
			),
		TEST_PANE_MESSAGE_TIMEOUT_MS,
	);
	const failInitial = (error: Error): void => {
		if (!initialArrived) {
			rejectInitial(error);
		}
	};
	const onMessage = (data: RawData): void => {
		try {
			const event = JSON.parse(data.toString()) as Event;
			events.push(event);
			if (event.type === "initial_elements") {
				initialArrived = true;
				resolveInitial(event);
			}
		} catch (error) {
			rejectInitial(error as Error);
		}
	};
	const onCloseBeforeInitial = (): void =>
		failInitial(new Error(`Pane ${options.clientId} closed before its initial scene arrived.`));
	const releaseSocketListeners = (): void => {
		socket.off("message", onMessage);
		socket.off("error", failInitial);
		socket.off("close", onCloseBeforeInitial);
	};
	socket.on("message", onMessage);
	socket.on("error", failInitial);
	socket.on("close", onCloseBeforeInitial);

	const register = async (board: string): Promise<void> => {
		const response = await bounded(
			options.clientId,
			"to register",
			TEST_PANE_MESSAGE_TIMEOUT_MS,
			(signal) => options.register(board, signal),
		);
		if (
			response.status === 200 &&
			record(response.body) &&
			response.body["success"] === true &&
			response.body["registered"] === true
		) {
			return;
		}
		throw new Error(
			`Pane ${options.clientId} did not register: HTTP ${response.status}, ${JSON.stringify(response.body)}.`,
		);
	};
	try {
		const initialEvent = await initial.finally(() => clearTimeout(initialTimer));
		await register(options.preferredBoard ?? initialEvent.board ?? "scratch");
	} catch (error) {
		try {
			await closeSocket(socket, options.clientId, TEST_PANE_MESSAGE_TIMEOUT_MS);
		} catch {
			// Preserve the readiness or registration failure after bounded cleanup.
		} finally {
			releaseSocketListeners();
		}
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
		async waitFor(match, start = 0, timeoutMs = TEST_PANE_MESSAGE_TIMEOUT_MS) {
			const deadline = Date.now() + timeoutMs;
			do {
				const found = events.slice(start).find(match);
				if (found) {
					return found;
				}
				await sleep(TEST_PANE_MESSAGE_POLL_MS);
			} while (Date.now() < deadline);
			return undefined;
		},
		async sync() {
			if (socket.readyState !== WebSocket.OPEN) {
				throw new Error(`Pane ${options.clientId} cannot synchronize a closed socket.`);
			}
			const token = Buffer.from(`${options.clientId}:${events.length}:${Date.now()}`);
			await new Promise<void>((resolve, reject) => {
				const cleanup = (): void => {
					clearTimeout(timer);
					socket.off("pong", onPong);
					socket.off("close", onClose);
					socket.off("error", onError);
				};
				const onPong = (data: Buffer): void => {
					if (!data.equals(token)) {
						return;
					}
					cleanup();
					resolve();
				};
				const onClose = (): void => {
					cleanup();
					reject(new Error(`Pane ${options.clientId} closed before its socket barrier.`));
				};
				const onError = (error: Error): void => {
					cleanup();
					reject(error);
				};
				const timer = setTimeout(() => {
					cleanup();
					reject(
						timeoutError(
							options.clientId,
							"to acknowledge its socket barrier",
							TEST_PANE_MESSAGE_TIMEOUT_MS,
						),
					);
				}, TEST_PANE_MESSAGE_TIMEOUT_MS);
				socket.on("pong", onPong);
				socket.once("close", onClose);
				socket.once("error", onError);
				try {
					socket.ping(token);
				} catch (error) {
					onError(error as Error);
				}
			});
		},
		async close() {
			if (closedAndUnregistered) {
				return;
			}
			const deadline = Date.now() + TEST_PANE_MESSAGE_TIMEOUT_MS;
			try {
				await closeSocket(socket, options.clientId, Math.max(1, deadline - Date.now()));
			} finally {
				releaseSocketListeners();
			}
			do {
				const remaining = Math.max(1, deadline - Date.now());
				const response = await bounded(
					options.clientId,
					"to read the pane registry",
					remaining,
					options.readPanes,
				);
				const panes =
					response.status === 200 &&
					record(response.body) &&
					response.body["success"] === true &&
					Array.isArray(response.body["panes"]) &&
					response.body["panes"].every(paneEntry)
						? response.body["panes"]
						: null;
				if (panes === null) {
					throw new Error(
						`Pane ${options.clientId} could not verify registry cleanup: HTTP ${response.status}, ${JSON.stringify(response.body)}.`,
					);
				}
				if (!panes.some((pane) => pane.clientId === options.clientId)) {
					closedAndUnregistered = true;
					return;
				}
				await sleep(Math.min(TEST_PANE_MESSAGE_POLL_MS, Math.max(1, deadline - Date.now())));
			} while (Date.now() < deadline);
			throw timeoutError(
				options.clientId,
				"to leave the pane registry",
				TEST_PANE_MESSAGE_TIMEOUT_MS,
			);
		},
	};
}
