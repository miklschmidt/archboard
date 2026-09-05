import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { WebSocket } from "ws";

export interface WorkbenchResult {
	readonly ok: boolean;
	readonly value?: Record<string, unknown>;
	readonly error?: string;
}

export interface ApplicationSocket {
	readonly socket: WebSocket;
	request(action: string, extra?: Record<string, unknown>): Promise<WorkbenchResult>;
	close(): Promise<void>;
}

export interface ProductionFixture {
	readonly root: string;
	readonly logPath: string;
	readonly controlPath: string;
	readonly executablePath: string;
	readonly vault: string;
}

export type FixtureSetupFailure = "root_setup" | "fixture_setup";

export function prepareProductionFixture(
	resources: AsyncDisposableStack,
	executableSource: string,
	options: {
		readonly failAt?: FixtureSetupFailure;
		readonly onRoot?: (root: string) => void;
		readonly onRootCleanup?: (root: string) => void;
	} = {},
): ProductionFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-codex-production-"));
	resources.defer(() => {
		rmSync(root, { recursive: true, force: true });
		options.onRootCleanup?.(root);
	});
	options.onRoot?.(root);
	if (options.failAt === "root_setup") throw new Error("injected production root setup failure");
	const logPath = join(root, "codex.ndjson");
	const controlPath = join(root, "control.json");
	const executablePath = join(root, "codex-fixture");
	writeFileSync(logPath, "");
	if (options.failAt === "fixture_setup")
		throw new Error("injected production fixture setup failure");
	writeFileSync(controlPath, JSON.stringify({ exit: false }));
	writeFileSync(
		executablePath,
		readFileSync(executableSource, "utf8")
			.replaceAll(
				"./fake-codex-production-data.ts",
				join(dirname(executableSource), "fake-codex-production-data.ts"),
			)
			.replace(/^#!.*\n/, `#!${process.execPath}\n`)
			.replaceAll("__ARCHBOARD_TEST_CODEX_LOG__", logPath)
			.replaceAll("__ARCHBOARD_TEST_CODEX_CONTROL__", controlPath),
	);
	chmodSync(executablePath, 0o700);
	return { root, logPath, controlPath, executablePath, vault: join(root, "vault") };
}

async function closeSocket(socket: WebSocket): Promise<void> {
	if (socket.readyState === WebSocket.CLOSED) return;
	await new Promise<void>((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const done = (): void => {
			if (timer !== undefined) clearTimeout(timer);
			socket.off("close", done);
			resolve();
		};
		socket.once("close", done);
		timer = setTimeout(() => {
			try {
				socket.terminate();
			} finally {
				done();
			}
		}, 100);
		try {
			if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
			else socket.close();
		} catch {
			done();
		}
	});
}

function socketError(value: unknown): Error {
	if (value instanceof Error) return value;
	if (
		value !== null &&
		typeof value === "object" &&
		"message" in value &&
		typeof value.message === "string"
	)
		return new Error(value.message, { cause: value });
	return new Error("The production workbench socket failed.", { cause: value });
}

export async function openApplicationSocket(
	base: string,
	clientId: string,
	options: {
		readonly onSocket?: (socket: WebSocket) => void;
		readonly timeoutMs?: number;
	} = {},
): Promise<ApplicationSocket> {
	const endpoint = new URL(base);
	endpoint.protocol = "ws:";
	endpoint.searchParams.set("clientId", clientId);
	const socket = new WebSocket(endpoint);
	const pending = new Map<
		string,
		{ readonly resolve: (value: WorkbenchResult) => void; readonly reject: (error: Error) => void }
	>();
	let sequence = 0;
	const onMessage = (raw: WebSocket.RawData): void => {
		const message = JSON.parse(raw.toString()) as WorkbenchResult & { requestId?: unknown };
		if (typeof message.requestId !== "string") return;
		pending.get(message.requestId)?.resolve(message);
		pending.delete(message.requestId);
	};
	const rejectPending = (message: string): void => {
		for (const waiter of pending.values()) waiter.reject(new Error(message));
		pending.clear();
	};
	socket.on("message", onMessage);
	const onSocketError = (error: unknown): void => rejectPending(socketError(error).message);
	const onSocketClose = (): void => rejectPending("The production workbench socket closed.");
	socket.on("error", onSocketError);
	socket.on("close", onSocketClose);
	let timeout: ReturnType<typeof setTimeout>;
	const cleanupOpening = (): void => {
		clearTimeout(timeout);
		socket.off("open", onOpen);
		socket.off("error", onOpenError);
		socket.off("close", onEarlyClose);
	};
	const onOpen = (): void => {
		cleanupOpening();
		resolveOpening();
	};
	const onOpenError = (error: unknown): void => {
		cleanupOpening();
		rejectOpening(socketError(error));
	};
	const onEarlyClose = (): void => {
		cleanupOpening();
		rejectOpening(new Error("The production workbench socket closed before opening."));
	};
	let resolveOpening!: () => void;
	let rejectOpening!: (error: Error) => void;
	const opening = new Promise<void>((resolve, reject) => {
		resolveOpening = resolve;
		rejectOpening = reject;
	});
	timeout = setTimeout(() => {
		cleanupOpening();
		rejectOpening(new Error("The production workbench socket open timed out."));
	}, options.timeoutMs ?? 2_000);
	socket.once("open", onOpen);
	socket.once("error", onOpenError);
	socket.once("close", onEarlyClose);
	void opening.catch(() => undefined);
	try {
		options.onSocket?.(socket);
		await opening;
	} catch (error) {
		cleanupOpening();
		socket.off("message", onMessage);
		socket.off("close", onSocketClose);
		rejectPending("The production workbench socket failed before opening.");
		await closeSocket(socket);
		socket.off("error", onSocketError);
		throw error;
	}
	return {
		socket,
		request(action, extra = {}) {
			const requestId = `production-${++sequence}`;
			const result = new Promise<WorkbenchResult>((resolve, reject) => {
				pending.set(requestId, { resolve, reject });
			});
			try {
				socket.send(
					JSON.stringify({ type: "codex_workbench_request", requestId, action, ...extra }),
				);
			} catch (error) {
				pending.delete(requestId);
				return Promise.reject(error);
			}
			return result;
		},
		async close() {
			socket.off("message", onMessage);
			rejectPending("The production workbench socket closed.");
			await closeSocket(socket);
			socket.off("error", onSocketError);
			socket.off("close", onSocketClose);
		},
	};
}
