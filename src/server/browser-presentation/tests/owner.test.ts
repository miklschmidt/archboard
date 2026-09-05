import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "bun:test";
import express from "express";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { PaneRegistration } from "../../../runtime/engine/panes.js";
import type { WebSocketMessage } from "../../../runtime/engine/types.js";
import type { BrowserPresentationDependencies } from "../index.js";

const inheritedVault = process.env["ARCHBOARD_VAULT"];
const selectedVault = mkdtempSync(path.join(tmpdir(), "archboard-browser-presentation-"));
process.env["ARCHBOARD_VAULT"] = selectedVault;

const { createBrowserPresentationOwner } = await import("../index.js");
const { createBoard } = await import("../../../runtime/engine/board-io.js");
const { boards } = await import("../../../runtime/engine/board-store.js");
const { makeIdentity } = await import("../../../runtime/engine/board.js");
const { EMPTY_CHECKOUT_SNAPSHOT } = await import("../../../runtime/code-target/index.js");
const {
	BROWSER_CAPTURE_COLLECTION_MS,
	BROWSER_CAPTURE_DISPATCH_MS,
	BROWSER_EXPORT_TIMEOUT_MS,
	BROWSER_VIEWPORT_SETTLEMENT_MS,
} = await import("../../../shared/timing/timing.js");

let server: Server | undefined;
let stopOwner: (() => void) | undefined;
let baseUrl = "";
const unhandledRejections: unknown[] = [];
const observeUnhandledRejection = (reason: unknown): void => {
	unhandledRejections.push(reason);
};

const pane: PaneRegistration = {
	clientId: "browser-1",
	paneId: "pane-1",
	board: "capture",
	primary: true,
	focused: true,
	elementCount: 0,
	rect: { x: 0, y: 0, width: 800, height: 600 },
	viewport: { x: 0, y: 0, width: 800, height: 600, zoom: 1 },
	at: new Date(0).toISOString(),
};

interface SentMessage {
	readonly clientId: string;
	readonly message: Readonly<WebSocketMessage>;
	readonly board: string;
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
} {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve(value) {
			if (resolvePromise === undefined) {
				throw new Error("Deferred resolver was not installed.");
			}
			resolvePromise(value);
		},
	};
}

async function post(route: string, body: unknown): Promise<Response> {
	return fetch(`${baseUrl}${route}`, {
		method: "POST",
		headers: { connection: "close", "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function postJson(
	route: string,
	body: unknown,
): Promise<{ readonly status: number; readonly body: unknown }> {
	const response = await post(route, body);
	const responseBody: unknown = await response.json();
	return { status: response.status, body: responseBody };
}

async function startOwner(
	boardForPane: BrowserPresentationDependencies["boardForPane"],
	statusForError: BrowserPresentationDependencies["statusForError"] = () => 500,
): Promise<{ readonly messages: SentMessage[]; readonly nextMessage: () => Promise<SentMessage> }> {
	const messages: SentMessage[] = [];
	let next = deferred<SentMessage>();
	const application = express();
	application.use(express.json());
	const owner = createBrowserPresentationOwner({
		panes: () => [pane],
		browserCount: () => 1,
		boardForPane,
		sendToPane(clientId, message, board) {
			const sent = { clientId, message, board };
			messages.push(sent);
			next.resolve(sent);
			next = deferred<SentMessage>();
			return true;
		},
		checkoutSnapshotFor: () => EMPTY_CHECKOUT_SNAPSHOT,
		statusForError,
		browserRequiredBody: (what) => ({ success: false, error: `${what} requires a browser.` }),
	});
	stopOwner = owner.stop;
	application.use(owner.router);
	server = application.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Browser presentation test server has no port.");
	}
	baseUrl = `http://127.0.0.1:${address.port}`;
	return { messages, nextMessage: async () => next.promise };
}

beforeAll(() => {
	createBoard(makeIdentity({ board: "capture" }));
});

afterEach(async () => {
	process.off("unhandledRejection", observeUnhandledRejection);
	stopOwner?.();
	stopOwner = undefined;
	jest.useRealTimers();
	if (server !== undefined) {
		const closed = once(server, "close");
		server.close();
		await closed;
		server = undefined;
	}
});

afterAll(() => {
	boards.clear();
	if (inheritedVault === undefined) {
		delete process.env["ARCHBOARD_VAULT"];
	} else {
		process.env["ARCHBOARD_VAULT"] = inheritedVault;
	}
	if (!selectedVault.startsWith(path.join(tmpdir(), "archboard-browser-presentation-"))) {
		throw new Error("Refusing to remove an unrecognised browser presentation test directory.");
	}
	rmSync(selectedVault, { recursive: true, force: true });
});

describe("browser presentation owner", () => {
	test("refuses stale and unreadable panes before allocating delayed work", async () => {
		const stale = await startOwner(() => "missing");
		unhandledRejections.length = 0;
		process.on("unhandledRejection", observeUnhandledRejection);
		jest.useFakeTimers();
		const staleResponse = await postJson("/api/browser/capture", { format: "png" });
		expect(staleResponse.status).toBe(409);
		expect(stale.messages).toEqual([]);
		jest.advanceTimersByTime(BROWSER_EXPORT_TIMEOUT_MS);
		await Promise.resolve();
		expect(unhandledRejections).toEqual([]);
		process.off("unhandledRejection", observeUnhandledRejection);

		stopOwner?.();
		jest.useRealTimers();
		const activeServer = server;
		if (activeServer === undefined) {
			throw new Error("Stale-pane test server was not started.");
		}
		const closed = once(activeServer, "close");
		activeServer.close();
		await closed;
		server = undefined;

		const state = boards.get("capture");
		const file = state?.file;
		if (file === undefined) {
			throw new Error("Capture fixture board has no note.");
		}
		writeFileSync(
			file,
			'---\narchboard:\n  board: capture\n---\n\n```json\n{"elements":[}\n```\n',
			"utf8",
		);
		const unreadable = await startOwner(() => "capture");
		process.on("unhandledRejection", observeUnhandledRejection);
		jest.useFakeTimers();
		const unreadableResponse = await postJson("/api/browser/capture", { format: "png" });
		expect(unreadableResponse.status).toBe(500);
		expect(unreadable.messages).toEqual([]);
		jest.advanceTimersByTime(BROWSER_EXPORT_TIMEOUT_MS);
		await Promise.resolve();
		expect(unhandledRejections).toEqual([]);
		process.off("unhandledRejection", observeUnhandledRejection);
		stopOwner?.();
		jest.useRealTimers();
		unlinkSync(file);
		createBoard(makeIdentity({ board: "capture" }));
	});

	test("collects the largest capture result and tolerates one client failure", async () => {
		const { nextMessage } = await startOwner(() => "capture");
		jest.useFakeTimers();
		const refreshMessage = nextMessage();
		const capture = post("/api/browser/capture", { format: "png", background: false });
		const refresh = await refreshMessage;
		expect(refresh.message.type).toBe("initial_elements");
		const captureRequest = nextMessage();
		jest.advanceTimersByTime(BROWSER_CAPTURE_DISPATCH_MS);
		const request = await captureRequest;
		expect(request.message.type).toBe("browser_capture_request");
		if (request.message.type !== "browser_capture_request") {
			throw new Error("Expected correlated capture request.");
		}
		await postJson("/api/browser/capture/result", {
			requestId: request.message["requestId"],
			error: "one tab",
		});
		await postJson("/api/browser/capture/result", {
			requestId: request.message["requestId"],
			format: "png",
			data: "small",
		});
		await postJson("/api/browser/capture/result", {
			requestId: request.message["requestId"],
			format: "png",
			data: "largest-result",
		});
		jest.advanceTimersByTime(BROWSER_CAPTURE_COLLECTION_MS);
		const captureResponse = await capture;
		const captureBody: unknown = await captureResponse.json();
		expect(captureBody).toEqual({
			success: true,
			format: "png",
			data: "largest-result",
		});
	});

	test("settles viewport results, ignores late results, and atomically cancels capture dispatch", async () => {
		const { messages, nextMessage } = await startOwner(() => "capture");
		const whitespace = await postJson("/api/viewport", { scrollToContent: true, pane: "   " });
		expect(whitespace.status).not.toBe(200);
		expect(messages).toEqual([]);
		const viewportMessage = nextMessage();
		const viewport = post("/api/viewport", { scrollToContent: true });
		const sent = await viewportMessage;
		expect(sent.message.type).toBe("set_viewport");
		if (sent.message.type !== "set_viewport") {
			throw new Error("Expected correlated viewport request.");
		}
		await postJson("/api/viewport/result", {
			requestId: sent.message["requestId"],
			success: true,
			message: "Framed",
		});
		const viewportResponse = await viewport;
		const viewportBody: unknown = await viewportResponse.json();
		expect(viewportBody).toEqual({
			success: true,
			message: "Framed",
		});
		const lateResponse = await postJson("/api/viewport/result", {
			requestId: sent.message["requestId"],
		});
		expect(lateResponse.status).toBe(200);
		const failingMessage = nextMessage();
		const failingViewport = post("/api/viewport", { zoom: 2 });
		const failingRequest = await failingMessage;
		if (failingRequest.message.type !== "set_viewport") {
			throw new Error("Expected viewport request before failure proof.");
		}
		await postJson("/api/viewport/result", {
			requestId: failingRequest.message["requestId"],
			error: "pane refused",
		});
		const failingResponse = await failingViewport;
		expect(failingResponse.status).toBe(500);
		await failingResponse.json();

		jest.useFakeTimers();
		const refreshMessage = nextMessage();
		const capture = post("/api/browser/capture", { format: "svg" });
		const captureRefresh = await refreshMessage;
		expect(captureRefresh.message.type).toBe("initial_elements");
		stopOwner?.();
		jest.advanceTimersByTime(BROWSER_CAPTURE_DISPATCH_MS);
		expect(messages.some(({ message }) => message.type === "browser_capture_request")).toBeFalse();
		const stoppedCaptureResponse = await capture;
		expect(stoppedCaptureResponse.status).toBe(500);
		await stoppedCaptureResponse.json();
	});

	test("clears deadline timers and acknowledges late capture and viewport results", async () => {
		const { nextMessage } = await startOwner(() => "capture");
		jest.useFakeTimers();

		const firstRefresh = nextMessage();
		const nearDeadlineCapture = post("/api/browser/capture", { format: "png" });
		await firstRefresh;
		const firstRequestMessage = nextMessage();
		jest.advanceTimersByTime(BROWSER_CAPTURE_DISPATCH_MS);
		const firstRequest = await firstRequestMessage;
		if (firstRequest.message.type !== "browser_capture_request") {
			throw new Error("Expected capture request before deadline proof.");
		}
		jest.advanceTimersByTime(BROWSER_EXPORT_TIMEOUT_MS - BROWSER_CAPTURE_DISPATCH_MS - 1);
		await postJson("/api/browser/capture/result", {
			requestId: firstRequest.message["requestId"],
			format: "png",
			data: "near-deadline",
		});
		jest.advanceTimersByTime(1);
		const nearDeadlineResponse = await nearDeadlineCapture;
		expect(nearDeadlineResponse.status).toBe(200);
		const nearDeadlineBody: unknown = await nearDeadlineResponse.json();
		expect(nearDeadlineBody).toEqual({
			success: true,
			format: "png",
			data: "near-deadline",
		});
		server?.closeIdleConnections();
		await Promise.resolve();
		expect(jest.getTimerCount()).toBe(0);

		const secondRefresh = nextMessage();
		const timedOutCapture = post("/api/browser/capture", { format: "svg" });
		await secondRefresh;
		const secondRequestMessage = nextMessage();
		jest.advanceTimersByTime(BROWSER_CAPTURE_DISPATCH_MS);
		const secondRequest = await secondRequestMessage;
		if (secondRequest.message.type !== "browser_capture_request") {
			throw new Error("Expected capture request before timeout proof.");
		}
		jest.advanceTimersByTime(BROWSER_EXPORT_TIMEOUT_MS - BROWSER_CAPTURE_DISPATCH_MS);
		const timedOutCaptureResponse = await timedOutCapture;
		expect(timedOutCaptureResponse.status).toBe(500);
		const timedOutCaptureBody: unknown = await timedOutCaptureResponse.json();
		expect(timedOutCaptureBody).toMatchObject({ success: false });
		const lateCaptureResult = await postJson("/api/browser/capture/result", {
			requestId: secondRequest.message["requestId"],
			format: "svg",
			data: "late",
		});
		expect(lateCaptureResult.status).toBe(200);

		const viewportMessage = nextMessage();
		const viewport = post("/api/viewport", { scrollToElementId: "missing" });
		const viewportRequest = await viewportMessage;
		if (viewportRequest.message.type !== "set_viewport") {
			throw new Error("Expected viewport request before timeout proof.");
		}
		jest.advanceTimersByTime(BROWSER_VIEWPORT_SETTLEMENT_MS);
		const viewportResponse = await viewport;
		expect(viewportResponse.status).toBe(500);
		const viewportBody: unknown = await viewportResponse.json();
		expect(viewportBody).toMatchObject({ success: false });
		const lateViewportResult = await postJson("/api/viewport/result", {
			requestId: viewportRequest.message["requestId"],
			error: "late",
		});
		expect(lateViewportResult.status).toBe(200);
		expect(jest.getTimerCount()).toBe(0);
	});
});
