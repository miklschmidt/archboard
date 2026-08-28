import { z } from "zod";
import { inspectBoard } from "../../../../src/runtime/board-inspection/index.ts";
import { CANVAS_SERVICE_NAME } from "../../../../src/runtime/engine/canvas-client.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.null(),
		z.boolean(),
		z.number(),
		z.string(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

export interface RecordedRequest {
	method: string;
	url: URL;
	body: unknown;
}

export interface CliHttpDouble {
	readonly url: string;
	readonly requests: readonly RecordedRequest[];
	readonly contacts: readonly string[];
	setBrowserClients(count: number): void;
	setCompatibilityRecord(name: string | null): void;
	writesSince(offset: number): readonly RecordedRequest[];
	dispose(): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
}

const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };
const document = [element];
const fingerprint = { elements: 1, note: "contract-note", version: 7 };
const bridgeFacts = {
	bridgeId: "Bridge01",
	overConnectorId: "over",
	underConnectorId: "under",
	overSegmentIndex: 0,
	underSegmentIndex: 0,
	crossing: { x: 50, y: 50 },
	background: "#ffffff",
};
const bridgePartsFor = (facts: typeof bridgeFacts) =>
	(["mask", "redraw"] as const).map((role, index) => ({
		id: index === 0 ? facts.bridgeId : "Redraw01",
		type: "line",
		x: 44,
		y: 50,
		points: [
			[0, 0],
			[12, 0],
		],
		groupIds: [],
		startBinding: null,
		endBinding: null,
		customData: { archboard: { bridge: { ...facts, role } } },
	}));
const findingReport = inspectBoard([
	{
		id: "finding-text",
		type: "text",
		x: 0,
		y: 0,
		width: 100,
		height: 20,
		text: "Finding",
		fontFamily: 99,
		fontSize: 20,
	},
]);
const findingPng = (() => {
	const bytes = Buffer.alloc(24);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
	bytes.writeUInt32BE(13, 8);
	bytes.write("IHDR", 12, "ascii");
	bytes.writeUInt32BE(528, 16);
	bytes.writeUInt32BE(208, 20);
	return bytes.toString("base64");
})();
const boardIdentity = {
	board: "contract",
	variant: "current",
	level: "system",
	displayName: "Contract",
};
const boardState = {
	board: "contract",
	identity: boardIdentity,
	elementCount: 1,
	version: 7,
	placeholder: false,
	file: "/vault/contract.excalidraw.md",
	savedAt: "2026-08-26T10:00:00.000Z",
	loadedAt: "2026-08-26T09:00:00.000Z",
};
const paneRef = { paneId: "pane-right", clientId: "client-right", place: "right", position: 2 };

function preflightResponse(
	method: string,
	url: URL,
	record: Record<string, unknown>,
	compatibilityRecord: string | null,
): Response | null {
	if (method === "POST" && url.pathname === "/api/viewport")
		return Response.json({ success: true, message: "Viewport updated" });
	if (method === "GET" && url.pathname === "/api/boards/info") {
		if (compatibilityRecord === "promote-binding-resolution-failure")
			return Response.json(
				{ success: false, error: "unexpected /api/boards/info" },
				{ status: 404 },
			);
		return Response.json({ success: true, ...boardState });
	}
	if (method === "POST" && url.pathname === "/api/boards/new")
		return Response.json({
			success: true,
			...boardState,
			version: null,
			elementCount: 0,
			created: true,
			saved: false,
			pane: null,
		});
	if (method === "POST" && url.pathname === "/api/boards/open")
		return Response.json({
			success: true,
			...boardState,
			source: "vault",
			pane: record.pane ? paneRef : null,
		});
	if (method === "POST" && url.pathname === "/api/panes/open")
		return Response.json({
			success: true,
			pane: paneRef,
			paneCount: 2,
			onScreen: [{ paneId: paneRef.paneId, place: paneRef.place, board: "contract" }],
		});
	return null;
}

export function createCliHttpDouble(observed: string[] = []): CliHttpDouble {
	const requests: RecordedRequest[] = [];
	const contacts: string[] = [];
	let browserClients = 1;
	let compatibilityRecord: string | null = null;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			const contact = `${request.method} ${url.pathname}`;
			contacts.push(contact);
			observed.push(contact);
			if (url.pathname === "/health")
				return Response.json({
					service: CANVAS_SERVICE_NAME,
					status: "ok",
					websocket_clients: browserClients,
				});
			const text = request.method === "GET" ? "" : await request.text();
			let body: unknown = null;
			if (text) {
				try {
					body = jsonValueSchema.parse(JSON.parse(text));
				} catch {
					return Response.json({ success: false, error: "invalid JSON" }, { status: 400 });
				}
			}
			requests.push({ method: request.method, url, body });
			const record =
				typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
			const held =
				url.searchParams.get("board") === "held"
					? { board: "held", message: "held board diagnostic", writes: 1 }
					: url.searchParams.get("board") === "invalid-held-read"
						? { board: 7, message: false }
						: undefined;
			const preflight = preflightResponse(request.method, url, record, compatibilityRecord);
			if (preflight) return preflight;
			if (request.method === "GET" && url.pathname === "/api/injection")
				return Response.json({
					success: true,
					enabled: true,
					armed: true,
					loud: false,
					refusal: null,
					host: "127.0.0.1",
					socket: {
						path: "/tmp/app-server.sock",
						exists: true,
						isSocket: true,
						ownedByUs: true,
						mode: "600",
					},
					connected: true,
					lastError: null,
					target: {
						threadId: "thread-fixture",
						reason: "pinned",
						explanation: "fixture",
						activeTurnId: null,
					},
					threadsSeen: 1,
					pending: 0,
					debounceMs: 200,
					minIntervalMs: 500,
					injected: { quiet: 2, loud: 1, failed: 0 },
					lastInjectionAt: "2026-08-26T10:01:00.000Z",
					lastInjection: {
						channel: "quiet",
						threadId: "thread-fixture",
						at: "2026-08-26T10:01:00.000Z",
						text: "fixture change",
					},
				});
			if (request.method === "POST" && url.pathname === "/api/injection/test")
				return Response.json({
					success: true,
					channel: record.loud ? "loud" : "quiet",
					threadId: "thread-fixture",
					text: "fixture injection text",
				});
			if (request.method === "POST" && url.pathname === "/api/boards/save") {
				if (url.searchParams.get("board") === "false-success")
					return Response.json({
						success: false,
						board: "false-success",
						identity: { board: "false-success", variant: "current" },
					});
				const conflict = {
					board: "save-conflict",
					file: "/vault/save-conflict.excalidraw.md",
					reason: "changed",
					actualHash: "actual",
					versionMove: "ahead",
					outcomes: {
						reload: "board open save-conflict --reload",
						overwrite: "board save --force",
						saveAs: "board save --as save-conflict@from-canvas",
					},
					message: "Refusing fixed-base board save. Nothing was written.",
				};
				return Response.json(
					{
						success: false,
						error: conflict.message,
						conflict,
						held:
							url.searchParams.get("board") === "invalid-held"
								? { board: 9, message: false }
								: { board: "save-conflict", message: "held board diagnostic", writes: 0 },
					},
					{ status: 409 },
				);
			}
			if (request.method === "POST" && url.pathname === "/api/export/findings") {
				if (url.searchParams.get("board") === "malformed-render")
					return Response.json({ board: 7, report: false });
				if (url.searchParams.get("board") === "unrenderable")
					return Response.json({
						board: "unrenderable",
						sourceFingerprint: "b".repeat(64),
						report: findingReport,
						sourceRenderable: false,
						results: [],
					});
				return Response.json({
					board: "contract",
					sourceFingerprint: "a".repeat(64),
					report: findingReport,
					sourceRenderable: true,
					results: [{ findingIndex: 0, data: findingPng }],
				});
			}
			if (request.method !== "GET" && !url.searchParams.get("doing"))
				return Response.json(
					{ success: false, code: "DOING_REQUIRED", error: "doing required" },
					{ status: 400 },
				);
			if (request.method === "PUT" && url.pathname === "/api/elements/refuse")
				return Response.json(
					{
						success: false,
						code: "BOARD_VERSION_CONFLICT",
						error: "Refusing contract write",
						document,
						version: 7,
						versionConflict: { expected: 6, actual: 7 },
					},
					{ status: 409 },
				);
			if (request.method === "GET" && url.pathname === "/api/elements")
				return Response.json({ success: true, elements: document, ...(held ? { held } : {}) });
			if (request.method === "GET" && url.pathname === "/api/elements/search")
				return Response.json({
					success: true,
					elements: url.searchParams.get("type") === "ellipse" ? [] : document,
					...(held ? { held } : {}),
				});
			if (request.method === "GET" && url.pathname === "/api/files")
				return Response.json({ success: true, files: {}, ...(held ? { held } : {}) });
			if (request.method === "GET" && url.pathname === "/api/snapshots/package-scene")
				return Response.json({
					success: true,
					snapshot: {
						name: "package-scene",
						board: "contract",
						elements: document,
						createdAt: "2026-08-27T00:00:00.000Z",
					},
				});
			if (request.method === "POST" && url.pathname === "/api/bridges") {
				const receiptFacts = {
					...bridgeFacts,
					overConnectorId:
						record.over === "invalid-receipt"
							? "wrong-over"
							: record.over === "mask-source-collision"
								? bridgeFacts.bridgeId
								: record.over === "redraw-source-collision"
									? "Redraw01"
									: bridgeFacts.overConnectorId,
				};
				return Response.json({
					success: true,
					board: "contract",
					bridgeId: receiptFacts.bridgeId,
					overConnectorId: receiptFacts.overConnectorId,
					underConnectorId: receiptFacts.underConnectorId,
					overSegmentIndex: receiptFacts.overSegmentIndex,
					underSegmentIndex: receiptFacts.underSegmentIndex,
					crossing: receiptFacts.crossing,
					elements:
						record.over === "invalid-receipt"
							? bridgePartsFor(bridgeFacts)
							: bridgePartsFor(receiptFacts),
					fingerprint,
				});
			}
			if (request.method === "DELETE" && url.pathname.startsWith("/api/bridges/")) {
				const bridgeId = decodeURIComponent(url.pathname.slice("/api/bridges/".length));
				return Response.json({
					success: true,
					board: "contract",
					bridgeId,
					deleted: ["Bridge01", "Redraw01"],
					elements: [],
					fingerprint,
				});
			}
			const askedForDocument = url.searchParams.get("document") === "1" || record.document === true;
			if (url.pathname.startsWith("/api/elements"))
				return Response.json({
					success: true,
					board: "contract",
					element,
					elements: document,
					created: url.pathname.endsWith("/batch") ? 1 : 0,
					updated: request.method === "PUT" ? 1 : 0,
					deleted: url.pathname.endsWith("/changes") ? 1 : 0,
					count: 1,
					fingerprint,
					...(held ? { held } : {}),
					...(askedForDocument ? { document } : {}),
				});
			return Response.json(
				{ success: false, error: `unexpected ${url.pathname}` },
				{ status: 404 },
			);
		},
	});
	const dispose = async () => {
		await server.stop(true);
	};
	return {
		url: `http://127.0.0.1:${server.port}`,
		requests,
		contacts,
		setBrowserClients(count) {
			browserClients = count;
		},
		setCompatibilityRecord(name) {
			compatibilityRecord = name;
		},
		writesSince(offset) {
			return requests
				.slice(offset)
				.filter((entry) => entry.method !== "GET" && entry.url.pathname.startsWith("/api/"));
		},
		dispose,
		[Symbol.asyncDispose]: dispose,
	};
}
