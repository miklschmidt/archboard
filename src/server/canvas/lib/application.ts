import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger, { closeLogger, forceCloseLogger } from "../../../runtime/engine/logger.js";
import { snapshots, selectionState } from "../../../runtime/engine/types.js";
import type {
	ServerElement,
	ExcalidrawFile,
	WebSocketMessage,
	InitialElementsMessage,
	Snapshot,
} from "../../../runtime/engine/types.js";
import { derivedId, mintId } from "../../../shared/ids/ids.js";
import { CodeBindingSchema, type CodeBinding } from "../../../shared/code-target/index.js";
import { buildSelectionReport } from "../../../runtime/engine/describe.js";
import { describeScene } from "../../../runtime/engine/describe.js";
import {
	ArchboardContextSchema,
	type ArchboardContext,
} from "../../../runtime/codex-instructions/index.js";
import type {
	SemanticContextInput,
	SettledChangeSourceEvent,
	SettledSemanticChangeEvent,
} from "../../../runtime/codex-semantic-context/index.js";
import { canonicalSemanticCursorToken } from "../../../runtime/codex-thread-context/index.js";
import type { DynamicWaitEvent } from "../../../runtime/codex-dynamic-tools/index.js";
import type { CodexWorkbenchComponents } from "../codex-workbench-generation.js";
import {
	createCanvasCodexBrowserSocketOwner,
	type BrowserConnectionInstance,
} from "../codex-workbench-browser.js";
import { createBrowserLeaseLedger, type BrowserLeaseLedger } from "../../codex-workbench/index.js";
import { requireExactSemanticPane } from "./codex-workbench-semantic-pane.js";
import type { CanvasCodexWorkbenchHost } from "./codex-workbench-production.js";
import type { createCanvasCodexWorkbenchApplication } from "./codex-workbench-application.js";
import {
	buildPanesReport,
	MAX_PANES,
	panesInOrder,
	resolvePaneSpec,
	soloPane,
} from "../../../runtime/engine/panes.js";
import type { PaneRegistration } from "../../../runtime/engine/panes.js";
import { BoardRequiredError, BoardResolutionError } from "../../../runtime/engine/board-target.js";
import { RenderGeometryError } from "../../../runtime/engine/geometry.js";
import { NativeElementValidationError } from "../../../runtime/engine/native-element.js";
import { z } from "zod";
import { WebSocket } from "ws";
import { writePidFile, removePidFile } from "../../../runtime/engine/pidfile.js";
import {
	boardSummaries,
	boards,
	copyElements,
	getOrCreateBoard,
	recordBaseline,
	SCRATCH_KEY,
} from "../../../runtime/engine/board-store.js";
import type { BoardState } from "../../../runtime/engine/board-store.js";
import {
	holdOn,
	isHeld,
	// board-lock.ts also exports `releaseHold`, for the mutex. The lock owns that
	// name — its check and ADR 0016 both use it — so ADR 0006's hold takes the
	// verb its own plan uses for the three outcomes: each one clears the hold.
	releaseHold as clearHold,
	reportHold,
	writesBoardNote,
	heldBoardKeys,
} from "../../../runtime/engine/board-hold.js";
import type { HoldReport } from "../../../runtime/engine/board-hold.js";
import {
	BoardWriteConflictError,
	boardFilesMessage,
	createBoard,
	emptyContent,
	materializeResolvedBoard,
	readBoardContent,
	readBoardFile,
	readBoardInspectionSnapshot,
	renderContent,
	resolveBoard,
	resolveInstalledBoard,
	resolveBoardNote,
} from "../../../runtime/engine/board-io.js";
import type {
	BoardContent,
	LoadedBoard,
	ResolvedBoard,
	ResolvedBoardNote,
} from "../../../runtime/engine/board-io.js";
import {
	BoardHeldError,
	BoardLockCancelledError,
	boardLockState,
	claimBoard,
	claimWriterId,
	holdBoard,
	onBoardLockChanged,
	onBoardSweep,
	forgetLockAnnouncements,
	recordLockCommit,
	releaseClaim,
	releaseHold,
	sleep,
	takeClaimRevocation,
	withBoardLock,
	watchBoardLocks,
} from "../../../runtime/engine/board-lock.js";
import type { LockHolder } from "../../../runtime/engine/board-lock.js";
import {
	checkDoing,
	forgetDoing,
	recentDoing,
	recordDoing,
} from "../../../runtime/engine/board-doing.js";
import type { DoingEntry } from "../../../runtime/engine/board-doing.js";
import {
	CURRENT_VARIANT,
	boardKey,
	classifyBoardSave,
	hashBoardBytes,
	listBoards,
	makeIdentity,
	normalizeBoardKey,
	SCRATCH_BOARD,
	panesFollowSave,
	parseBoardKey,
	requireVaultRoot,
	validateLevel,
	validateVariant,
	vaultPathFor,
} from "../../../runtime/engine/board.js";
import type { BoardIdentity } from "../../../runtime/engine/board.js";
import {
	checkBoardVersion,
	forgetRememberedVersions,
	rememberVersion,
	rememberVersionAt,
	statedVersion,
	versionOfNoteAt,
} from "../../../runtime/engine/board-version.js";
import {
	noteWrittenElsewhere,
	onNoteWrittenElsewhere,
	refreshNoteWatch,
	forgetNoteWatch,
} from "../../../runtime/engine/note-watch.js";
import type { NoteWrittenElsewhere } from "../../../runtime/engine/note-watch.js";
import { ARCHBOARD_VAULT, noVaultMessage } from "../../../runtime/engine/config.js";
import { restampVariant } from "../../../runtime/engine/promote.js";
import { boardsForRepo } from "../../../runtime/engine/repo-boards.js";
import { compareBoards } from "../../../runtime/engine/compare.js";
import type { CompareSideInput } from "../../../runtime/engine/compare.js";
import { changeFeed } from "../../../runtime/engine/change-feed.js";
import type { ChangeEvent } from "../../../runtime/engine/change-feed.js";
import {
	BROWSER_EXPORT_TIMEOUT_MS,
	CANVAS_HTTP_STOP_GRACE_MS,
	CANVAS_MUTATION_DRAIN_TIMEOUT_MS,
	CODEX_WAIT_TARGET_POLL_MS,
	PANE_LAYOUT_TIMEOUT_MS,
	PANE_SETTLE_CAP_MS,
	REPORT_PROGRESS_MS,
} from "../../../shared/timing/timing.js";
import {
	CanvasApplicationBusyError,
	CanvasApplicationHeldError,
	createCanvasApplicationLifetime,
	createCanvasMutationAdmission,
	type CanvasMutationLease,
} from "./application-lifetime.js";
import { narrateChange } from "../../../runtime/engine/changes.js";
import { readLibrary, writeLibrary } from "../../../runtime/engine/library.js";
import type { LibraryItem } from "../../../runtime/engine/library.js";
import { overlapsRegion } from "../../../runtime/engine/geometry.js";
import {
	AgentElementInputSchema,
	HumanElementChangeSchema,
	type ElementInputRequest,
} from "../../../runtime/engine/apply-element-input.js";
import {
	agentWriteAnswer,
	humanWriteAnswer,
	BoardMutationError,
	elementMutation,
	SCENE_REPLACEMENT_MARKER,
	writeBoard,
} from "../../../runtime/engine/board-write.js";
import { drawnFileIds, usableEmbeddedFile } from "../../../runtime/engine/embedded-files.js";
import type { BoardWriteRequest, BoardWriteTarget } from "../../../runtime/engine/board-write.js";
import {
	codeBindingsOf,
	presentElement,
	presentElements,
	presentationContextFromElement,
	stripBindingPresentationLinks,
} from "../../../runtime/engine/presentation.js";
import {
	EMPTY_CHECKOUT_SNAPSHOT,
	snapshotCheckoutAccess,
	type CheckoutSnapshot,
} from "../../../runtime/code-target/index.js";
import { frontendState, sourceState } from "../../../runtime/engine/staleness.js";
import {
	BridgeRefusal,
	planBridgeCreate,
	planBridgeRemoval,
} from "../../../runtime/board-inspection/bridge.js";
import {
	InspectionPolicyInputSchema,
	inspectBoard,
} from "../../../runtime/board-inspection/index.js";
import { findingRasterDimensions } from "../../../shared/finding-raster/index.js";
import {
	BoardRendererError,
	createBoardRenderingOwner,
	DEFAULT_MERMAID_CONFIG,
	type BoardRenderSnapshot,
	type MermaidRenderJobResult,
} from "../../board-rendering/index.js";
import {
	createCodeOpenerPreguard,
	createCodeOpenerRouter,
	isCodeOpenerBodyRoute,
} from "../../code-opener/index.js";
import { createCanvasHttpServer } from "./http-server.js";
import {
	canvasStartupOwnershipRecord,
	canvasStartupTerminalRecord,
	writeCanvasStartupProtocolRecord,
} from "../../../shared/canvas-startup-terminal/index.js";
import { canvasStartupFailureMessage } from "./startup-error.js";

// Load environment variables
dotenv.config({ quiet: true });

const moduleFile = fileURLToPath(import.meta.url);
// Keep asset resolution anchored at src/, where the former root application
// module lived. Moving implementation must not change dist/ or dependency paths.
const moduleDir = path.resolve(path.dirname(moduleFile), "../../..");

const app = express();
const boardRenderer = createBoardRenderingOwner();

const mutationAdmission = createCanvasMutationAdmission({
	drainTimeoutMs: CANVAS_MUTATION_DRAIN_TIMEOUT_MS,
});
const admittedMutations = new WeakMap<Request, CanvasMutationLease>();

interface CheckoutWork {
	readonly controller: AbortController;
	promise: Promise<unknown> | null;
}

let acceptingCheckoutWork = true;
const activeCheckoutWork = new Set<CheckoutWork>();

function trackCheckoutWork<T>(
	name: string,
	externalSignal: AbortSignal | undefined,
	work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	if (!acceptingCheckoutWork)
		return Promise.reject(new Error(`Canvas checkout work is stopping; ${name} was not admitted.`));
	const controller = new AbortController();
	const cancel = (): void =>
		controller.abort(externalSignal?.reason ?? new Error(`${name} canceled.`));
	externalSignal?.addEventListener("abort", cancel, { once: true });
	if (externalSignal?.aborted) cancel();
	const owner: CheckoutWork = { controller, promise: null };
	activeCheckoutWork.add(owner);
	const promise = (async (): Promise<T> => {
		try {
			controller.signal.throwIfAborted();
			return await work(controller.signal);
		} finally {
			externalSignal?.removeEventListener("abort", cancel);
			activeCheckoutWork.delete(owner);
		}
	})();
	owner.promise = promise;
	return promise;
}

async function trackRequestCheckoutWork<T>(
	req: Request,
	res: Response,
	name: string,
	work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const request = new AbortController();
	const cancel = (): void => request.abort(new Error(`${req.method} ${req.path} disconnected.`));
	req.once("aborted", cancel);
	res.once("close", cancel);
	try {
		return await trackCheckoutWork(name, request.signal, work);
	} finally {
		req.off("aborted", cancel);
		res.off("close", cancel);
	}
}

function quiesceCheckoutWork(): void {
	acceptingCheckoutWork = false;
	for (const owner of activeCheckoutWork)
		owner.controller.abort(new Error("Canvas checkout work stopped."));
}

async function stopCheckoutWork(): Promise<void> {
	quiesceCheckoutWork();
	const active = [...activeCheckoutWork];
	await Promise.allSettled(active.flatMap((owner) => (owner.promise ? [owner.promise] : [])));
}

function trackMutationWork<T>(
	req: Request,
	name: string,
	work: (signal: AbortSignal) => Promise<T> | T,
): Promise<T> {
	const lease = admittedMutations.get(req);
	if (!lease) return Promise.reject(new Error(`${req.method} ${req.path} has no mutation lease.`));
	return lease.track(name, work);
}

type AsyncEndpoint = (
	req: Request,
	res: Response,
	next: NextFunction,
	signal: AbortSignal,
) => Promise<unknown>;

function asyncEndpoint(
	handler: AsyncEndpoint,
): (req: Request, res: Response, next: NextFunction) => void {
	return (req, res, next) => {
		void trackMutationWork(req, `${req.method} ${req.path} handler`, (signal) =>
			handler(req, res, next, signal),
		).catch((error) => {
			if (req.aborted || res.destroyed) return;
			setImmediate(next, error);
		});
	};
}

interface Wiring {
	codex: {
		installed: boolean;
		phase: "idle" | "preparing" | "installed" | "stopping" | "stopped";
		shutdown: (() => Promise<void>) | null;
		acceptBrowser: ((instance: BrowserConnectionInstance, browserId: string) => void) | null;
		closeBrowser:
			| ((instance: BrowserConnectionInstance, browserId: string) => Promise<void>)
			| null;
		drainBrowsers: (() => Promise<void>) | null;
		handleBrowserMessage:
			| ((
					instance: BrowserConnectionInstance,
					browserId: string,
					input: unknown,
					send: (message: unknown) => void,
			  ) => Promise<void>)
			| null;
	};
}

const server = createCanvasHttpServer(app);
let wss: WebSocketServer | null = null;
let canvasLifetime: ReturnType<typeof createCanvasApplicationLifetime> | null = null;
const wiring: Wiring = {
	codex: {
		installed: false,
		phase: "idle",
		shutdown: null,
		acceptBrowser: null,
		closeBrowser: null,
		drainBrowsers: null,
		handleBrowserMessage: null,
	},
};

// Middleware
app.use(cors());

// Admission precedes every mutation-specific guard and body parser. Parsing is
// one request lease; explicit async route and board-lock work takes a second
// lease so disconnecting the response cannot make unfinished mutation work
// disappear from shutdown's authoritative drain.
app.use((req: Request, res: Response, next: NextFunction) => {
	if (req.method === "GET" || req.method === "HEAD" || !req.path.startsWith("/api/")) return next();
	const name = `${req.method} ${req.path}`;
	const lease = mutationAdmission.admit(name);
	if (lease === null) {
		res.setHeader("Retry-After", "1");
		res.status(503).json({
			success: false,
			code: "CANVAS_STOPPING",
			error:
				"The canvas is checking whether it can stop and is not accepting writes. " +
				"If the canvas remains running, retry after resolving any held board it reports.",
		});
		return;
	}
	admittedMutations.set(req, lease);
	req.once("aborted", () => lease.abort(new Error(`${name} request body was aborted.`)));
	res.once("finish", lease.finish);
	res.once("close", () => {
		if (res.writableFinished) lease.finish();
		else lease.abort(new Error(`${name} response disconnected.`));
	});
	next();
});

function checkoutSnapshotFor(res: Response): CheckoutSnapshot {
	return (res.locals.checkoutSnapshot as CheckoutSnapshot | undefined) ?? EMPTY_CHECKOUT_SNAPSHOT;
}

const PROCESS_FREE_HUMAN_ROUTES = new Set([
	"/api/boards/hold",
	"/api/boards/hold/release",
	"/api/panes",
	"/api/selection",
]);

function openBoardBindings(): ReturnType<typeof codeBindingsOf> {
	const bindings: ReturnType<typeof codeBindingsOf> = [];
	for (const board of boards.values()) {
		try {
			bindings.push(...codeBindingsOf(readBoardContent(board).elements.values()));
		} catch {
			// A malformed board remains the route's own visible refusal.
		}
	}
	return bindings;
}

function codeBindingsInValue(value: unknown): CodeBinding[] {
	const bindings: CodeBinding[] = [];
	const pending: unknown[] = [value];
	const seen = new Set<object>();
	while (pending.length > 0) {
		const candidate = pending.pop();
		if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
		seen.add(candidate);
		if (!Array.isArray(candidate)) {
			const custom = (candidate as Record<string, unknown>).customData;
			if (custom && typeof custom === "object" && !Array.isArray(custom)) {
				const archboard = (custom as Record<string, unknown>).archboard;
				if (archboard && typeof archboard === "object" && !Array.isArray(archboard)) {
					const parsed = CodeBindingSchema.safeParse(
						(archboard as Record<string, unknown>).binding,
					);
					if (parsed.success) bindings.push(parsed.data);
				}
			}
		}
		pending.push(...(Array.isArray(candidate) ? candidate : Object.values(candidate)));
	}
	return bindings;
}

interface PreparedBoardOpen {
	readonly key: string;
	readonly resolution: ResolvedBoardNote;
	readonly reload: boolean;
}

function unopenedBoardBindings(req: Request, res: Response): CodeBinding[] {
	if (req.method !== "POST" || req.path !== "/api/boards/open") return [];
	const parsed = BoardAddressSchema.extend({
		reload: z.boolean().optional(),
		pane: z.string().optional(),
	}).safeParse(req.body ?? {});
	if (!parsed.success) return [];
	try {
		const identity = identityFromParams(parsed.data);
		const key = boardKey(identity);
		if (boards.has(key) && !parsed.data.reload) return [];
		const resolution = resolveBoardNote(key, "Opening a board");
		res.locals.preparedBoardOpen = {
			key,
			resolution,
			reload: parsed.data.reload === true,
		} satisfies PreparedBoardOpen;
		return codeBindingsInValue(JSON.parse(resolution.loaded.sceneJson));
	} catch {
		// The route remains the authority for malformed or unavailable board input.
		return [];
	}
}

function requestCheckoutBindings(req: Request, res: Response): CodeBinding[] {
	const named =
		req.method === "POST" && req.path === "/api/boards/open" ? undefined : boardOfRequest(req);
	let namedBindings: CodeBinding[] = [];
	if (named) {
		try {
			namedBindings = codeBindingsOf(resolveBoard(named).content.elements.values());
		} catch {
			// The route owns the typed board-resolution refusal.
		}
	}
	return [
		...openBoardBindings(),
		...namedBindings,
		...codeBindingsInValue(req.body),
		...unopenedBoardBindings(req, res),
	];
}

// Resolve machine-local checkout authority before any board lock is taken.
// Code-opener routes make their own snapshot at activation time, so settings
// and activation can never share authority accidentally.
async function prepareCheckoutSnapshot(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	if (!req.path.startsWith("/api/")) return next();
	if (
		req.path === "/api/render/board" ||
		req.path === "/api/export/findings" ||
		req.path === "/api/elements/from-mermaid"
	)
		return next();
	if (req.method !== "GET" && PROCESS_FREE_HUMAN_ROUTES.has(req.path)) return next();
	if (
		req.method === "POST" &&
		req.path === "/api/elements/changes" &&
		(!req.body ||
			typeof req.body !== "object" ||
			(req.body as Record<string, unknown>).origin !== "agent")
	)
		return next();
	if (req.path.startsWith("/api/settings/opener") || req.path === "/api/code-targets/open") {
		return next();
	}
	const bindings = requestCheckoutBindings(req, res);
	const capture = (captureBindings: readonly CodeBinding[]): Promise<CheckoutSnapshot> => {
		if (req.method === "GET" || req.method === "HEAD") {
			return trackRequestCheckoutWork(
				req,
				res,
				`${req.method} ${req.path} checkout snapshot`,
				(signal) => snapshotCheckoutAccess({ signal, bindings: captureBindings }),
			);
		}
		return trackMutationWork(req, `${req.method} ${req.path} checkout snapshot`, (signal) =>
			trackCheckoutWork(`${req.method} ${req.path} checkout snapshot`, signal, (ownedSignal) =>
				snapshotCheckoutAccess({ signal: ownedSignal, bindings: captureBindings }),
			),
		);
	};
	res.locals.checkoutSnapshot = await capture(bindings);
	const prepared = res.locals.preparedBoardOpen as PreparedBoardOpen | undefined;
	const installed = prepared ? boards.get(prepared.key) : undefined;
	if (installed !== undefined && prepared?.reload === false) {
		let installedBindings = codeBindingsOf(readBoardContent(installed).elements.values());
		for (;;) {
			res.locals.checkoutSnapshot = await capture(installedBindings);
			const refreshed = codeBindingsOf(readBoardContent(installed).elements.values());
			if (JSON.stringify(refreshed) === JSON.stringify(installedBindings)) break;
			installedBindings = refreshed;
		}
	}
	next();
}

app.use(createCodeOpenerPreguard());

const globalJson = express.json({ limit: "10mb" });
app.use((req: Request, res: Response, next: NextFunction) => {
	if (isCodeOpenerBodyRoute(req.method, req.path)) return next();
	globalJson(req, res, next);
});

app.use((req: Request, res: Response, next: NextFunction) => {
	void prepareCheckoutSnapshot(req, res, next).catch((error) => setImmediate(next, error));
});

// A board that has stopped saving says so in every answer about it.
//
// One line rather than a line in each of thirty routes, because the point of a
// held board is that nobody working on it can fail to notice (TASK-079). An
// agent that never sees the refusal — a different process, a different turn —
// still gets the hold, the three outcomes and how much is riding on them
// attached to the next thing it reads or draws. Refusals carry it too: a 409
// is exactly when it is worth saying.
//
// It is put on the response rather than fetched by the caller so that adding a
// route cannot forget it.
app.use((req: Request, res: Response, next: NextFunction) => {
	const asked =
		typeof req.query.board === "string"
			? req.query.board
			: req.body && typeof req.body === "object" && typeof req.body.board === "string"
				? req.body.board
				: "";
	if (!asked.trim()) return next();
	const key = normalizeBoardKey(asked);
	const send = res.json.bind(res);
	res.json = (body: unknown) => {
		const hold = holdOn(key);
		return send(
			hold && body && typeof body === "object" && !Array.isArray(body)
				? { ...(body as Record<string, unknown>), held: reportHold(key, hold) }
				: body,
		);
	};
	next();
});

// Serve the frontend bundle, and only that.
//
// This used to mount `../dist` as well, which meant whatever a build tool had
// left in that directory was reachable over http by path. Under ADR 0014 vite
// writes nothing but `dist/frontend`, so today that mount adds nothing. But a
// checkout from before ADR 0014 still has a compiled server, CLI and every core
// module sitting in `dist/`, and the broad mount served all of it. What is
// reachable is now this line's decision rather than a build tool's.
// `tests/system/process-contracts/local-bind.test.ts` plants a file in `dist/`
// and checks it 404s.
app.use(express.static(path.join(moduleDir, "../dist/frontend")));
app.get("/assets/excalidraw.css", (_req, res) => {
	res.sendFile("index.css", {
		root: path.join(moduleDir, "../node_modules/@excalidraw/excalidraw/dist/prod"),
	});
});
// Serve Excalidraw fonts so the font subsetting worker can fetch them for export
app.use(
	"/assets/fonts",
	express.static(path.join(moduleDir, "../node_modules/@excalidraw/excalidraw/dist/prod/fonts")),
);

// WebSocket connections.
//
// WHAT THIS PROCESS IS STILL ALLOWED TO HOLD, and why, because ADR 0015 says
// the note is the board and the canvas holds no copy of one. Three kinds of
// thing survive that, and the test is which question each answers.
//
// Session and display state answers "what is on this screen, now": the sockets
// below, `clientIds`, `panes`, `paneBoards`, `selectionState`, the four
// `pending*` maps and `wiring`. None of it can live in a note, all of it dies
// with the tab, and a reading of ADR 0015 that forbade it would be
// unimplementable — which is why the ADR names it.
//
// A record of what a board used to be answers "how did it stand then": the
// change feed's baseline and checkpoints (`src/runtime/engine/change-feed.ts`) and
// `snapshots` (`src/types.ts`). Each carries its own reasoning; the short form
// is that the vault has never held a board's past and so statelessness does not
// move them anywhere.
//
// Where each board's note is answers "which boards does this canvas have open"
// (`src/runtime/engine/board-store.ts`). That is a fact about this process, like which
// pane has focus, and the note has nowhere to put it.
//
// Nothing else. Anything that answers "what is on this board" is the note.
//
const clients = new Set<WebSocket>();
// Accepted transport ownership begins before checkout presentation. A socket
// is broadcast-admitted only after initial_elements, but teardown must be able
// to terminate a peer that never reaches that point or ignores a close frame.
const acceptedSockets = new Set<WebSocket>();
// Browser client id per socket, taken from the ?clientId= connect param. The
// same id is sent with every selection post, which is what lets a disconnect
// retire that client's selection.
const clientIds = new Map<WebSocket, string>();
// The exact socket currently presenting one pane identity. A reconnect may
// overlap the prior transport; only this map's value owns client-id keyed pane,
// selection, hold, and note-open state.
const currentSocketsByClient = new Map<string, WebSocket>();
// Initialization may finish out of acceptance order. One token per accepted
// client generation keeps a slower predecessor from taking authority back.
const latestSocketAcceptanceByClient = new Map<string, object>();
const codexSocketInstances = new Map<WebSocket, BrowserConnectionInstance>();
const browserLeaseLedger: BrowserLeaseLedger = createBrowserLeaseLedger();

// What is on screen right now, one entry per pane, keyed by the same client id.
// A pane is in here only while its socket is open: closing a tab or unsplitting
// takes the registration with it, so `panes` can never report a pane that is no
// longer in front of anybody. Empty is the normal headless state.
const panes = new Map<string, PaneRegistration>();

// Which board each pane has been pointed at, keyed by client id.
//
// This is the *authority*: what the server has decided a pane holds. The
// registration above carries what the pane says it is rendering, which is the
// same thing a beat later, and reporting the pane's own answer is what keeps
// `panes` a description of the displayed scenes rather than a restatement of
// this map.
//
// Entries outlive the socket on purpose. A dropped connection reconnects with
// the same client id, and a pane that came back showing a different board than
// it had a second ago would undo a user's scene arrangement.
const paneBoards = new Map<string, string>();

/** What each pane holds, in reading order. */
function boardsOnScreen(): Array<{ paneId: string; place: string; board: string }> {
	return panesInOrder(Array.from(panes.values())).map((entry) => ({
		paneId: entry.pane.paneId,
		place: entry.place,
		board: paneBoards.get(entry.pane.clientId) ?? entry.pane.board,
	}));
}

/** The live sockets belonging to one pane. */
function socketsFor(clientId: string): WebSocket[] {
	const found: WebSocket[] = [];
	clientIds.forEach((id, socket) => {
		if (id === clientId && socket.readyState === WebSocket.OPEN) found.push(socket);
	});
	return found;
}

// Broadcast to all connected clients.
//
// The board key is not optional: a client showing board A has to be able to
// drop a message about board B rather than merge it into what it is rendering.
// With two panes on two boards that filter stops being a formality — it is the
// only thing keeping an edit on one board out of the other one's scene.
function broadcast(message: WebSocketMessage, board: string): void {
	const data = JSON.stringify({ ...message, board });
	clients.forEach((client) => {
		try {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	});
}

// Send to one pane, named by client id.
//
// A board switch is the message this exists for: it replaces the receiving
// pane's whole scene, so sending it to every socket is how one pane's `board
// open` used to drag the other pane along with it.
function sendToPane(clientId: string, message: WebSocketMessage, board: string): boolean {
	return deliverToPane(clientId, JSON.stringify({ ...message, board }));
}

// Send one pane something that is about the pane itself rather than about a
// board: open another one, close this one. Layout is not board news — the
// receiving pane keeps whatever board it is holding — so stamping a board key
// on it would be inventing one. Kept separate from sendToPane so that omitting
// the board stays a deliberate act rather than a missing argument.
function sendLayoutToPane(clientId: string, message: WebSocketMessage): boolean {
	return deliverToPane(clientId, JSON.stringify(message));
}

function deliverToPane(clientId: string, data: string): boolean {
	let delivered = false;
	for (const socket of socketsFor(clientId)) {
		try {
			socket.send(data);
			delivered = true;
		} catch {
			logger.warn("Failed to send to a pane, removing");
			clients.delete(socket);
		}
	}
	return delivered;
}

/**
 * A board's writer changed, so every pane holding it is told (ADR 0016).
 *
 * The lock is a broadcast and not only a guard. `holder` lets panes explain a
 * claim and decide whether a content edit is takeover. A connected pane keeps
 * local content responsive; the authoritative vault-backed mutex still orders
 * when that content may persist.
 *
 * The board key is stamped on by `broadcast`, so a pane showing the other board
 * drops it the same way it drops any other board's news.
 */
function lockMessage(board: string, holder: LockHolder | null): WebSocketMessage {
	return { type: "board_lock", board, held: holder !== null, holder };
}

onBoardLockChanged((board, holder) => {
	broadcast(lockMessage(board, holder), board);
});

/**
 * An agent has just changed this board, and said what it was doing (TASK-095).
 *
 * Board-scoped like the lock, and beside it on purpose: the lock says who has
 * the board, the claim's reason says what the claim is for, and this is the
 * current step. One account at two scales, not two accounts of the same thing.
 *
 * The whole list rides with each line, so a pane that has just opened, or has
 * just received this board, is not blank until the next write. It costs a
 * few hundred bytes and it is what makes two panes on one board tell the same
 * story.
 */
function announceDoing(board: string, entry: DoingEntry): void {
	const recent = recordDoing(board, entry);
	broadcast({ type: "board_doing", doing: entry, recent } as WebSocketMessage, board);
}

/**
 * A write that did not say what it was doing.
 *
 * The refusal teaches, because being made to write the sentence is the point:
 * a person watching boxes move in the pane has no other way to know
 * what is being attempted, and an intent no diff can recover is one only the
 * writer can state (CLAUDE.md's principle, ADR 0016's claim from the other
 * end).
 */
function refuseUndescribedWrite(
	res: Response,
	board: string,
	requestPath: string,
	problem: string,
): void {
	res.status(400).json({
		success: false,
		code: "DOING_REQUIRED",
		error:
			`This write to "${board}" says nothing about what it is doing (${problem}). Say it in one short ` +
			'line, in the present tense — "adding the payment queue", "rerouting orders through it" — and it ' +
			"goes up on the canvas as the write lands, so the person at the board can see what you are up to. " +
			`On the command line that is \`--doing "..."\`, and on the API it is \`?doing=\` (${requestPath}). ` +
			`A claim's \`reason\` is the overall reason and does not stand in for this: ` +
			"this is the step. Nothing was written.",
		board,
	});
}

/**
 * Somebody outside archboard wrote this board's note, and the panes holding it
 * are showing a board the vault no longer has (TASK-062).
 *
 * A separate message from `board_lock` because it is a separate fact. A lock
 * says another archboard writer has the board right now and the pane must stop
 * accepting edits. This says nothing is stopping anybody: the pane keeps
 * drawing, and what it is drawing on is a copy. Telling one story with the
 * other's message would mean a board going read-only because Obsidian saved.
 */
function noteMessage(board: string, written: NoteWrittenElsewhere | null): WebSocketMessage {
	return { type: "board_note", board, writtenElsewhere: written };
}

onNoteWrittenElsewhere((board, written) => {
	broadcast(noteMessage(board, written), board);
});

// Registered here rather than by the module itself so that the one place the
// lock watcher is wired is the one place anything rides on it.
onBoardSweep((board) => {
	refreshNoteWatch(board);
});

/**
 * Watch the lock files of the boards on screen, while there is a screen.
 *
 * The broadcast above reaches the panes of this canvas. A second canvas over
 * the same vault cannot be told anything, because the lock is a file, so its
 * panes would learn about a claim at the write rather than before the touch —
 * for a claim that runs minutes, that is minutes of a pane letting somebody
 * draw into a board an agent has (ADR 0016). Reading the files is how a pane
 * hears news nobody sent it.
 *
 * Only while a tab is connected: a pane exists while something renders it, and
 * with nothing rendering there is nobody to be wrong. Called on every
 * connection and every close, so the cost is paid by a canvas somebody is
 * looking at and by no other.
 */
function syncLockWatch(): void {
	watchBoardLocks(clients.size > 0 ? () => [...paneBoards.values()] : null);
}
syncLockWatch();

/**
 * Tell one pane where a board stands, now.
 *
 * A broadcast only reaches a pane that was connected when it went out, and a
 * pane arrives — a new tab, a reconnection, a board switch — into a board that
 * may already be held. Without this it would believe a held board is free until
 * the next thing happens to it, which is the fail-open the ADR forbids.
 */
function tellPaneAboutLock(clientId: string, board: string): void {
	sendToPane(clientId, lockMessage(board, boardLockState(board)), board);
	// And whether the note is the one this board came from. Same reasoning, same
	// moment: a tab that opens onto a board Obsidian rewrote an hour ago would
	// otherwise hear nothing until the next sweep found a change, and the change
	// it is waiting for already happened.
	sendToPane(clientId, noteMessage(board, noteWrittenElsewhere(board)), board);
	// And the last few things an agent said it was doing here (TASK-095). A pane
	// that has just received a board an agent is part way through would
	// otherwise show the banner saying somebody has it and nothing at all about
	// what has happened so far.
	const said = recentDoing(board);
	if (said.length > 0) {
		sendToPane(clientId, { type: "board_doing", recent: said } as WebSocketMessage, board);
	}
}

// Broadcast something that is not about a board.
//
// Only the library qualifies today: it is one palette behind every board, so a
// client applies it without asking which board the message came from. Kept
// separate from broadcast() so that omitting the board key stays a deliberate
// act rather than a missing argument.
function broadcastBoardless(message: WebSocketMessage): void {
	const data = JSON.stringify(message);
	clients.forEach((client) => {
		try {
			if (client.readyState === WebSocket.OPEN) client.send(data);
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	});
}

/**
 * A board's elements, read out of its note.
 *
 * The one answer to "what is on this board", for everything that is not a
 * request working against content it already read: the change feed at the end
 * of a settle delay, a pane receiving a board, the report of what each pane
 * holds. Each is a fresh read, which is what makes them agree with the note
 * rather than with a copy of it that stopped being right at some point nobody
 * noticed (ADR 0015).
 */
function boardElements(board: BoardState): ServerElement[] {
	return Array.from(readBoardContent(board).elements.values());
}

/** How many elements a board has, for a summary that does not need them all. */
function boardElementCount(board: BoardState): number {
	try {
		return readBoardContent(board).elements.size;
	} catch (error) {
		// A malformed persisted scratch note is still an open board address. Keep
		// board listings and health usable while its pane carries the actual error.
		if (error instanceof RenderGeometryError || error instanceof NativeElementValidationError)
			return 0;
		throw error;
	}
}

/**
 * A board is saving again, and every pane holding it should say so.
 *
 * One of the three outcomes has been chosen and carried out by the time this
 * runs; which one, and what it cost, is the caller's to have decided (ADR
 * 0006). All this does is take the mark down.
 */
function releaseBoardHold(
	key: string,
	outcome: "reload" | "overwrite" | "elsewhere",
): HoldReport | null {
	const hold = clearHold(key);
	if (!hold) return null;
	const report = reportHold(key, hold);
	logger.info(`Board "${key}" is saving again (${outcome}), after ${hold.writes} held change(s).`);
	broadcast({ type: "board_released", hold: report, outcome } as WebSocketMessage, key);
	return report;
}

/** The hold on a board, as a caller is told about it — or nothing to say. */
function holdResponse(key: string): Record<string, unknown> {
	const hold = holdOn(key);
	return hold ? { held: reportHold(key, hold) } : {};
}

/**
 * The boards this canvas has open, each saying whether it is still saving.
 *
 * `board list` is where an agent arriving mid-session finds out, without having
 * to write to a board to discover that writing to it goes nowhere.
 */
function openBoards(): Array<Record<string, unknown>> {
	return boardSummaries(boardElementCount).map((summary) =>
		Object.assign({}, summary, holdResponse(summary.key)),
	);
}

// Which board a request is about, and what is on it. `?board=` or a `board`
// field in the body — and one of them has to be there. A request that names no
// board is refused (ADR 0009); `what` is the name of the operation, so the
// refusal can say what it was that needed a board.
//
// The note is read here, once, and the request works against what it read. That
// read is what makes the vault the truth (ADR 0015): there is no map to consult
// instead, so the answer cannot be a copy that stopped agreeing with the note.
function boardFromRequest(
	req: Request,
	what?: string,
): { key: string; board: BoardState; content: BoardContent } {
	return resolveBoard(boardOfRequest(req), what);
}

/** Resolve a write's board without reading its note ahead of the write entry. */
function boardTargetFromRequest(req: Request, what?: string): BoardWriteTarget {
	const prepared = (req as Request & { resolvedBoardWrite?: ResolvedBoard }).resolvedBoardWrite;
	const asked = boardOfRequest(req);
	const key = asked ? boardKey(parseBoardKey(asked)) : "";
	if (prepared && prepared.key === key) return { key: prepared.key, board: prepared.board };
	const { key: resolvedKey, board } = resolveInstalledBoard(asked, what, { write: true });
	return { key: resolvedKey, board };
}

// Which board a request says it is about, before anything resolves its note.
// The write boundary uses the resolved key to find the per-board lock.
function boardOfRequest(req: Request): string | undefined {
	const fromQuery = typeof req.query.board === "string" ? req.query.board : undefined;
	const fromBody =
		req.body && typeof req.body === "object" && typeof req.body.board === "string"
			? (req.body.board as string)
			: undefined;
	return fromQuery ?? fromBody;
}

// A board that was not named, or whose address cannot resolve, is a client
// error rather than a server fault.
function boardErrorStatus(error: unknown): number {
	if (error instanceof z.ZodError) return 400;
	if (error instanceof BoardRequiredError) return error.status;
	if (error instanceof BoardResolutionError) return error.status;
	if (error instanceof BoardMutationError) return error.status;
	if (error instanceof BoardRendererError) return 503;
	if (error instanceof RenderGeometryError) return 400;
	if (error instanceof NativeElementValidationError) return 400;
	// A refused write is not a fault, it is the other outcome the write always
	// had (ADR 0006). Every route that writes can now produce it, because every
	// write goes to the note (ADR 0015), so it is answered here once rather than
	// in each of them.
	if (error instanceof BoardWriteConflictError) return 409;
	// Somebody else is writing this board and did not finish inside the wait
	// (ADR 0016). The same 409 as a conflict, because it is the same shape of
	// answer: the write did not happen and here is what stood in its way.
	if (error instanceof BoardHeldError) return 409;
	return /is not open|Invalid board name|Invalid variant|Invalid level|No vault configured|outside the vault|No pane called|matches \d+ panes|No pane is open|needs a pane/.test(
		(error as Error).message,
	)
		? 400
		: 500;
}

/** The note state an agent receives with a write-boundary refusal. */
function refusalDocument(
	board: string,
	checkoutSnapshot: CheckoutSnapshot = EMPTY_CHECKOUT_SNAPSHOT,
): { document: ServerElement[]; version: number | null } {
	const state = boards.get(board);
	if (!state) throw new Error(`Board "${board}" is not open`);
	const content = readBoardContent(state);
	return {
		document: presentElements(content.elements.values(), { boardKey: board, checkoutSnapshot }),
		version: content.version ?? null,
	};
}

// The refusal, as a body. Carries persisted choices as data so a caller can
// act on it without parsing the sentence.
function boardErrorBody(
	error: unknown,
	checkoutSnapshot: CheckoutSnapshot = EMPTY_CHECKOUT_SNAPSHOT,
): Record<string, unknown> {
	const base = {
		success: false,
		error:
			error instanceof z.ZodError
				? error.issues.map((issue) => issue.message).join("; ")
				: (error as Error).message,
	};
	if (error instanceof BoardRequiredError) {
		return { ...base, code: error.code, available: error.available };
	}
	if (error instanceof BoardResolutionError) {
		return {
			...base,
			code: error.code,
			board: error.board,
			reason: error.reason,
			...(error.files.length > 0 ? { files: error.files } : {}),
		};
	}
	// The three outcomes as data, so a surface offers them rather than rewording
	// them. Which one the human picks is never archboard's to choose.
	if (error instanceof BoardWriteConflictError) {
		return { ...base, conflict: error.conflict };
	}
	// Who has the board and since when, as data as well as a sentence, so a voice
	// session has something to say and a client has something to act on.
	if (error instanceof BoardHeldError) {
		const document = boards.has(error.board) ? refusalDocument(error.board, checkoutSnapshot) : {};
		return {
			...base,
			code: error.code,
			board: error.board,
			holder: error.holder,
			waitedMs: error.waitedMs,
			...document,
		};
	}
	if (error instanceof BoardRendererError) return { ...base, code: error.code };
	if (error instanceof BoardMutationError && error.code) return { ...base, code: error.code };
	return base;
}

function answerBoardError(res: Response, error: unknown, what?: string): void {
	if (what) logger.error(what, error);
	res.status(boardErrorStatus(error)).json(boardErrorBody(error, checkoutSnapshotFor(res)));
}

/** Send one board-write answer and retain the version it already produced. */
function answerBoardWrite<T>(res: Response, request: BoardWriteRequest<T>): void {
	const afterPersist = request.afterPersist;
	res.json(
		writeBoard(
			{
				...request,
				checkoutSnapshot: checkoutSnapshotFor(res),
				afterPersist: (context) => {
					if (context.written) {
						res.locals.writtenBoardVersion = context.written.version;
						const lockKey = res.locals.boardLockKey;
						const leaseToken = res.locals.boardLockToken;
						if (
							typeof lockKey === "string" &&
							typeof leaseToken === "string" &&
							context.target.key === lockKey
						) {
							recordLockCommit(lockKey, leaseToken, context.written.hash);
						}
					}
					afterPersist?.(context);
				},
			},
			broadcast,
		),
	);
}

/**
 * What a pane opening for the first time should show.
 *
 * A split is "another look at what I am working on", so a new pane starts on
 * whatever is already in front of the human and is then pointed somewhere else
 * deliberately. With nothing on screen there is nothing to copy, and the
 * server's active board — the last one opened — is the only answer available.
 */
function boardForNewPane(clientId: string): string {
	const remembered = paneBoards.get(clientId);
	if (remembered && boards.has(remembered)) return remembered;
	const existing = Array.from(panes.values());
	const reference =
		existing.find((pane) => pane.primary) ?? existing.find((pane) => pane.focused) ?? existing[0];
	const key = reference ? (paneBoards.get(reference.clientId) ?? reference.board) : null;
	return key && boards.has(key) ? key : SCRATCH_KEY;
}

// WebSocket connection handling. The lifecycle creates and closes the server;
// this function owns one accepted socket only.
async function acceptWebSocketConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
	const codexSocketInstance = Object.freeze({});
	codexSocketInstances.set(ws, codexSocketInstance);
	const clientId = new URL(req.url ?? "/", "http://localhost").searchParams.get("clientId");
	const acceptanceToken = clientId ? Object.freeze({}) : null;
	if (clientId) {
		clientIds.set(ws, clientId);
		latestSocketAcceptanceByClient.set(clientId, acceptanceToken!);
	}
	const checkoutController = new AbortController();
	ws.on("close", () => {
		checkoutController.abort(new Error("WebSocket closed during checkout presentation."));
		clients.delete(ws);
		const closingId = clientIds.get(ws);
		clientIds.delete(ws);
		const closingCodexInstance = codexSocketInstances.get(ws);
		codexSocketInstances.delete(ws);
		// Exact Codex cleanup is safe for a replaced socket. Client-id keyed canvas
		// state is not: a replacement may already own that pane identity.
		if (closingId) {
			if (latestSocketAcceptanceByClient.get(closingId) === acceptanceToken)
				latestSocketAcceptanceByClient.delete(closingId);
			if (closingCodexInstance !== undefined)
				void wiring.codex
					.closeBrowser?.(closingCodexInstance, closingId)
					.catch((error) => logger.error("Codex browser cleanup failed:", error));
			if (currentSocketsByClient.get(closingId) !== ws) {
				syncLockWatch();
				logger.info(`Replaced WebSocket connection closed (client ${closingId})`);
				return;
			}
			currentSocketsByClient.delete(closingId);
			selectionState.byClient.delete(closingId);
			const held = paneBoards.get(closingId);
			if (held) releaseHold(held, closingId);
			panes.delete(closingId);
			notePaneClosed(closingId);
		}
		if (closingId && selectionState.current?.clientId === closingId) {
			selectionState.current = null;
			broadcastSelection();
			logger.info(`Selection cleared: owning client ${closingId} disconnected`);
		}
		syncLockWatch();
		logger.info("WebSocket connection closed");
	});
	ws.on("error", (error) => {
		checkoutController.abort(error);
		logger.error("WebSocket error:", error);
		clients.delete(ws);
	});
	// Which board this pane gets, and it is a board *for this pane* — not "the"
	// board, which no longer exists as a single thing. A pane that has been here
	// before (a dropped socket, not a new tab) resumes what it was holding,
	// because a reconnect must not undo a user's scene arrangement.
	const startingKey = clientId ? boardForNewPane(clientId) : SCRATCH_KEY;
	const board = boards.get(startingKey)!;
	// Read out of the note, like everything else that sends a pane a whole board.
	// Scratch is registered before the listener binds. If its legacy note is
	// malformed, start with no scene rather than sending any of those elements
	// to Excalidraw, then put the refusal on screen. The note stays untouched.
	let snapshotContent: BoardContent;
	let renderError: RenderGeometryError | NativeElementValidationError | null;
	try {
		snapshotContent = readBoardContent(board);
		renderError = null;
	} catch (error) {
		if (!(error instanceof RenderGeometryError || error instanceof NativeElementValidationError))
			throw error;
		snapshotContent = emptyContent();
		renderError = error;
	}
	let content = snapshotContent;
	let bindings = codeBindingsOf(content.elements.values());
	let checkoutSnapshot: CheckoutSnapshot;
	for (;;) {
		checkoutSnapshot = await trackCheckoutWork(
			"WebSocket checkout presentation",
			checkoutController.signal,
			(signal) => snapshotCheckoutAccess({ signal, bindings }),
		);
		if (ws.readyState !== WebSocket.OPEN) return;
		// Reads and broadcasts share this event loop. Once the binding set is
		// stable across the async checkout capture, read, send, authority transfer,
		// and broadcast admission form one synchronous sequence with no lost delta.
		try {
			content = readBoardContent(board);
			renderError = null;
		} catch (error) {
			if (!(error instanceof RenderGeometryError || error instanceof NativeElementValidationError))
				throw error;
			content = emptyContent();
			renderError = error;
		}
		const refreshedBindings = codeBindingsOf(content.elements.values());
		if (JSON.stringify(refreshedBindings) === JSON.stringify(bindings)) break;
		bindings = refreshedBindings;
	}
	const initialMessage: InitialElementsMessage & {
		files?: Record<string, ExcalidrawFile>;
		identity: BoardIdentity;
	} = {
		type: "initial_elements",
		board: startingKey,
		identity: board.identity,
		elements: presentElements(content.elements.values(), {
			boardKey: startingKey,
			checkoutSnapshot,
		}),
		...boardFilesMessage(content),
	};
	await new Promise<void>((resolve, reject) => {
		try {
			ws.send(JSON.stringify(initialMessage), (error) => (error ? reject(error) : resolve()));
		} catch (error) {
			reject(error);
		}
	});
	if (ws.readyState !== WebSocket.OPEN) return;
	if (clientId) {
		if (latestSocketAcceptanceByClient.get(clientId) !== acceptanceToken) {
			ws.terminate();
			return;
		}
		const previous = currentSocketsByClient.get(clientId);
		paneBoards.set(clientId, startingKey);
		currentSocketsByClient.set(clientId, ws);
		if (previous !== undefined && previous !== ws) previous.terminate();
	}
	// Ownership is registered before the checkout await, but content admission
	// begins only after the initial scene is on the wire. A concurrent delta can
	// therefore never overtake initialization and then be replaced by it.
	clients.add(ws);
	if (clientId) {
		try {
			wiring.codex.acceptBrowser?.(codexSocketInstance, clientId);
		} catch (error) {
			logger.error("Codex browser acceptance failed:", error);
		}
	}
	// There is a screen again, so the lock files of what is on it are worth
	// reading (ADR 0016).
	syncLockWatch();
	logger.info(`New WebSocket connection established${clientId ? ` (client ${clientId})` : ""}`);
	if (renderError) {
		ws.send(
			JSON.stringify({
				type: "board_error",
				board: startingKey,
				error:
					`Could not open "${startingKey}" from ${board.file}. ${renderError.message} ` +
					`The note was left unchanged. Correct it, then run \`board open ${startingKey} --reload\`.`,
			} satisfies WebSocketMessage),
		);
	}
	// And where its lock stands. A broadcast only reaches panes that were already
	// connected, so a tab that has just arrived — or come back from a dropped
	// socket — is told outright rather than left assuming the board is free.
	if (clientId) tellPaneAboutLock(clientId, startingKey);

	ws.on("message", (raw) => {
		let message: unknown;
		try {
			message = JSON.parse(raw.toString()) as unknown;
		} catch {
			return;
		}
		if (
			typeof message !== "object" ||
			message === null ||
			!("type" in message) ||
			message.type !== "codex_workbench_request"
		)
			return;
		const requestId =
			"requestId" in message && typeof message.requestId === "string" ? message.requestId : null;
		const action =
			"action" in message && typeof message.action === "string" ? message.action : null;
		const send = (response: unknown): void => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(response));
		};
		if (!clientId) {
			send({
				type: "codex_workbench_result",
				requestId,
				action,
				ok: false,
				error: "The Codex workbench requires an authoritative browser connection identity.",
			});
			return;
		}
		const handle = wiring.codex.handleBrowserMessage;
		if (handle === null) {
			send({
				type: "codex_workbench_result",
				requestId,
				action,
				ok: false,
				error: "The Codex workbench is unavailable.",
			});
			return;
		}
		void handle(codexSocketInstance, clientId, message, send).catch((error) =>
			logger.error("Codex browser request failed:", error),
		);
	});
}

// ─── One writer at a time ─────────────────────────────────────
//
// Every request that could change a board takes the board's mutex before the
// handler runs and gives it back when the response goes out (ADR 0016,
// `src/runtime/engine/board-lock.ts`). One place, so no route assembles the steps itself
// and no route can forget to.
//
// **Deny by default.** Anything that is not a GET and names a board is a write
// unless it is listed below with the reason it is not. A route added later and
// not thought about therefore locks a board it did not need to, which costs a
// few milliseconds; the other way round costs a lost update, and would be
// invisible.
//
// Nothing between the lock and the handler awaits, so the read-modify-write
// cycle inside the handler is still one synchronous run (`board-io.ts`). What
// changes is what keeps two of them apart: express ran them one at a time, and
// now the mutex does, which is the same guarantee extended to a second process.
const NOT_A_BOARD_WRITE: Array<[RegExp, string]> = [
	[/^\/api\/boards\/hold/, "is the lock"],
	[/^\/api\/boards\/claim/, "is the lock, held for longer"],
	[/^\/api\/panes/, "layout, not board content, and open/close wait on the browser"],
	[/^\/api\/viewport/, "a camera move, and it waits on the browser"],
	[/^\/api\/browser\//, "a live browser operation, not board content"],
	[/^\/api\/export/, "a picture of a board, which only reads it"],
	[/^\/api\/render/, "a server-owned Board render, which only reads its snapshot"],
	[/^\/api\/selection/, "a selection is not board content"],
	[/^\/api\/library/, "one palette behind every board, and not board content"],
	[/^\/api\/snapshots/, "reads a board into a snapshot and writes no note"],
	[/^\/api\/boards\/open$/, "reads a note and points a pane at it"],
	[
		/^\/api\/boards\/new$/,
		"exclusively creates a new note rather than modifying an existing board",
	],
	[
		/^\/api\/code-targets\/open$/,
		"reads canonical board state and launches a process but writes no note",
	],
];

/**
 * Who this request writes as.
 *
 * A pane sends its client id, and that id is what makes the lock reentrant: the
 * hold taken for a user edit covers the change report that edit produces 400 ms
 * later. An agent sends none, so it gets a fresh identity per request and takes
 * and releases the board around that one write — which is the per-write mutex.
 *
 * Unless this canvas holds a claim on the board, in which case an agent's write
 * *is* the claim's, and that is the whole of how a claim survives across
 * requests (ADR 0016, TASK-080). Nothing is threaded through the caller: a CLI
 * agent is a fresh process every command and has nowhere to keep an id, so the
 * canvas keeps it, against the board every call already names. The write joins
 * the claim's hold rather than taking one, so twenty writes leave no gap.
 */
function holderFromRequest(req: Request, board: string): { id: string; kind: "human" | "agent" } {
	const raw = (req.body ?? {}) as Record<string, unknown>;
	// A pane's id may arrive in the query as well as the body, because two of the
	// shell's own writes have no body to put it in: Clear is a DELETE, and both
	// it and Save are a person pressing a button. A write with a pane behind it
	// is that person's, and a person is not made to narrate their own act
	// (TASK-095).
	const body =
		typeof raw.clientId === "string" || typeof req.query.clientId !== "string"
			? raw
			: { ...raw, clientId: req.query.clientId };
	const kind = body.origin === "agent" || typeof body.clientId !== "string" ? "agent" : "human";
	if (kind === "agent") {
		const claimed = claimWriterId(board);
		if (claimed) return { id: claimed, kind };
	}
	const id =
		typeof body.clientId === "string" && body.clientId
			? body.clientId
			: `agent-${Math.random().toString(36).slice(2, 10)}`;
	return { id, kind };
}

/**
 * The board was claimed and a person took it back, and this is the agent
 * finding out.
 *
 * The one place it is said, because the agent has to hear it whatever it does
 * next: writing, or claiming again. Told once — `takeClaimRevocation` clears as
 * it reads — so an agent that has understood can carry on, and the board is not
 * left wedged against the agent that used to hold it.
 *
 * Nothing is rolled back. Every write made under the claim is in the note,
 * because that is what it means for the note to be the board, so the answer
 * says what state the board was left in rather than pretending it can be
 * undone.
 */
function refuseRevokedClaim(res: Response, board: string): boolean {
	const lost = takeClaimRevocation(board);
	if (!lost) return false;
	const who = lost.by?.kind === "human" ? "The person at the canvas" : "Somebody";
	res.status(409).json({
		success: false,
		code: "CLAIM_REVOKED",
		error:
			`${who} took "${board}" back, so your claim${lost.claim.holder.reason ? ` (${lost.claim.holder.reason})` : ""}` +
			" has ended. Everything you had already written is in the note and nothing was undone, so the board is " +
			"part way through whatever you were doing — say what state you left it in rather than carrying on. " +
			"Writing again is an ordinary write, and takes the board only for as long as that write.",
		board,
		claim: lost.claim,
		revokedBy: lost.by,
		...refusalDocument(board, checkoutSnapshotFor(res)),
	});
	return true;
}

app.use((req: Request, res: Response, next: NextFunction) => {
	if (req.method === "GET" || req.method === "HEAD") return next();
	if (!req.path.startsWith("/api/")) return next();
	// A route that is not a board write writes no note, so there is no version
	// for a precondition to be about either.
	if (NOT_A_BOARD_WRITE.some(([pattern]) => pattern.test(req.path))) return next();

	let key: string;
	try {
		const asked = boardOfRequest(req);
		if (!asked) throw new BoardRequiredError([], "A write");
		key = boardKey(parseBoardKey(asked));
	} catch {
		// No board named, or the address itself is malformed. The handler refuses
		// better than this can: it knows the operation's name.
		return next();
	}

	// An agent whose claim was taken back hears about it here, before anything is
	// written, because "you no longer have this board" is the answer to the write
	// rather than a note attached to a write that went through.
	const writer = holderFromRequest(req, key);
	res.locals.boardWriterKind = writer.kind;
	if (writer.kind === "agent" && refuseRevokedClaim(res, key)) return;

	// Which version this write says it is against (TASK-091). One that is not a
	// number is refused before the board is taken: it is a malformed request
	// rather than a conflict, and nothing should wait on a lock to be told so.
	// What the canvas remembers telling this writer is read later, under the
	// lock, because that half can move while a write waits for the board.
	const stated = statedVersion(req.query.expectVersion, writer.kind);
	if (!stated.ok) {
		res
			.status(400)
			.json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem, board: key });
		return;
	}

	// And what the board turned out to be is what this writer has now been told,
	// which is what its next write will be checked against. On `finish` and only
	// on success, beside the `doing` announcement and for the same reason. The
	// three write-boundary refusals carry their own current document and version.
	res.on("finish", () => {
		if (res.statusCode >= 400) return;
		if (writer.kind !== "agent" || claimWriterId(key) !== writer.id) return;
		if ("writtenBoardVersion" in res.locals) {
			rememberVersion(writer.id, res.locals.writtenBoardVersion as number | null);
		} else {
			rememberVersionAt(writer.id, boards.get(key)?.file);
		}
	});

	// And an agent says what it is doing, on this write, before it takes the
	// board. Same boundary as the lock and for the same reason: this is the one
	// place that knows a request is a board write, so a route added later cannot
	// be the one that got away with saying nothing.
	let said: string | null = null;
	if (writer.kind === "agent") {
		const check = checkDoing(req.query.doing);
		if (!check.ok) return refuseUndescribedWrite(res, key, req.path, check.problem);
		said = check.doing;
	}

	// Said as the write lands, not before it: a refusal narrates nothing, and a
	// pane that showed intended writes as completed writes would be inaccurate.
	if (said !== null) {
		const doing = said;
		res.on("finish", () => {
			if (res.statusCode >= 400) return;
			announceDoing(key, {
				doing,
				at: new Date().toISOString(),
				by: writer.id,
				kind: writer.kind,
				claimed: claimWriterId(key) === writer.id,
			});
		});
	}

	void trackMutationWork(req, `${req.method} ${req.path} board-lock wait`, async (signal) => {
		const hold = await holdBoard({ board: key, holder: writer, signal });
		res.locals.boardLockKey = key;
		res.locals.boardLockToken = hold.leaseToken;
		try {
			(req as Request & { resolvedBoardWrite?: ResolvedBoard }).resolvedBoardWrite =
				resolveInstalledBoard(key, "A write", {
					write: true,
					...(hold.predecessorHash !== undefined
						? { trustedPredecessorHash: hold.predecessorHash }
						: {}),
				});
		} catch (error) {
			if (hold.created) releaseHold(key, hold.holder.id);
			answerBoardError(res, error);
			return;
		}
		// Under the lock, so no other archboard writer can land between the
		// version being read and the note being written; before `next()`, so a
		// refusal writes nothing (TASK-091). The board is given straight back:
		// the handlers that would do that on `finish` are registered below this,
		// and a request that never reaches the handler never took the board for
		// any longer than this line.
		const rememberedBy =
			writer.kind === "agent" && claimWriterId(key) === writer.id ? writer.id : undefined;
		const conflict = checkBoardVersion({
			board: key,
			file: (req as Request & { resolvedBoardWrite?: ResolvedBoard }).resolvedBoardWrite?.board
				.file,
			writesNote: writesBoardNote(key),
			...(stated.expected !== undefined ? { stated: stated.expected } : {}),
			...(rememberedBy ? { rememberedBy } : {}),
		});
		if (conflict) {
			res.status(409).json({
				success: false,
				code: "BOARD_VERSION_CONFLICT",
				error: conflict.message,
				versionConflict: conflict,
				...refusalDocument(key, checkoutSnapshotFor(res)),
			});
			if (hold.created) releaseHold(key, hold.holder.id);
			return;
		}
		if (hold.created) {
			let given = false;
			const give = (): void => {
				if (given) return;
				given = true;
				releaseHold(key, hold.holder.id);
			};
			// Both, because a client that hangs up mid-write never finishes the
			// response, and a board held by a request nobody is listening to is a
			// board held until the lease lapses.
			res.on("finish", give);
			res.on("close", give);
		}
		next();
	}).catch((error) => {
		if (error instanceof BoardLockCancelledError && (req.aborted || res.destroyed)) return;
		answerBoardError(res, error);
	});
});

app.use(
	createCodeOpenerRouter({
		runCheckout: (req, res, name, work) => trackRequestCheckoutWork(req, res, name, work),
		runMutation: (req, name, work) => trackMutationWork(req, name, work),
	}),
);

/**
 * A person has started changing this board, and wants it.
 *
 * The message the pane sends on the leading edge of a content edit. The first
 * progress report is due after REPORT_PROGRESS_MS even during a continuous
 * gesture, and renewal every LOCK_RENEW_MS keeps the lease alive while content
 * remains pending.
 *
 * It waits, but only for as long as the pane was going to sit on the change
 * anyway. An agent's per-write hold is about twenty milliseconds, and a user
 * edit that starts during one is not somebody who has lost the board — telling
 * them so and discarding their edit would make the pane reject a user edit,
 * which is the thing ADR 0016 forbids in as many words. So the
 * wait is the progress deadline: a person is going to be 400 ms from having their
 * change written whatever this answers, and anything still holding the board at
 * the end of that is a real holder rather than a write in flight.
 *
 * Not the agent's five seconds, for the other half of the same reason. A person
 * cannot be made to wait that long to find out whether their edit was accepted.
 */
app.post("/api/boards/hold", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Holding a board");
		const body = (req.body ?? {}) as { clientId?: unknown; reason?: unknown };
		if (typeof body.clientId !== "string" || !body.clientId) {
			return res.status(400).json({
				success: false,
				error:
					"A hold needs a clientId: the lock is reentrant by holder, and an unnamed holder cannot be renewed or released.",
			});
		}
		const holder = {
			id: body.clientId,
			kind: "human" as const,
			...(typeof body.reason === "string" && body.reason ? { reason: body.reason } : {}),
		};
		// And it takes a claimed board back. The lock excludes writers from each
		// other; it does not lock somebody out of their own board, and an agent
		// that has claimed a board for ten minutes must not be able to make the
		// pane reject that user's edits (ADR 0016). Only a
		// claim: an unclaimed agent hold is one write and is waited out above.
		void trackMutationWork(req, `${req.method} ${req.path} board-lock wait`, (signal) =>
			holdBoard({
				board: key,
				holder,
				waitMs: REPORT_PROGRESS_MS,
				revokeClaim: true,
				signal,
			}),
		)
			.then((hold) =>
				res.json({ success: true, board: key, holder: hold.holder, created: hold.created }),
			)
			.catch((error) => {
				if (error instanceof BoardLockCancelledError && (req.aborted || res.destroyed)) return;
				answerBoardError(res, error);
			});
	} catch (error) {
		answerBoardError(res, error);
	}
});

/**
 * They have stopped, the change has been written, and the board can go.
 *
 * A person's hold covers one edit and not a session (ADR 0016): holding it for as
 * long as a board is on screen would block every agent for as long as anybody
 * has the board open. The pane sends this once its report has landed and
 * nothing new has arrived since.
 *
 * Idempotent, and it releases nothing that is not this holder's. A pane that
 * dies without sending it costs one lease.
 */
app.post("/api/boards/hold/release", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Releasing a board");
		const body = (req.body ?? {}) as { clientId?: unknown };
		if (typeof body.clientId !== "string" || !body.clientId) {
			return res
				.status(400)
				.json({ success: false, error: "A release needs the clientId that took the hold." });
		}
		res.json({ success: true, board: key, released: releaseHold(key, body.clientId) });
	} catch (error) {
		answerBoardError(res, error);
	}
});

/**
 * An agent is about to redraw this board and wants it until it says otherwise.
 *
 * The per-write lock fits most of what an agent does. It does not fit twenty
 * writes that only make sense together: taking and releasing the board twenty
 * times leaves nineteen gaps for somebody else to write into, and the board is
 * never in one consistent state while it is being built (ADR 0016).
 *
 * Claiming again extends: the same claim, a later deadline, and a reason that
 * can be brought up to date with what the agent is now doing. A write does not
 * extend it, because the expiry exists to bound a working agent and would bound
 * nothing if the work moved it.
 *
 * It waits for a person mid-edit like any other writer, and it is refused if
 * they are still there. A claim is not a way past the human at the canvas.
 */
app.post("/api/boards/claim", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Claiming a board");
		const body = (req.body ?? {}) as { reason?: unknown; forMs?: unknown };
		if (typeof body.reason !== "string" || !body.reason.trim()) {
			return res.status(400).json({
				success: false,
				error:
					"A claim needs a reason: it is what the pane shows the person whose board you have taken. " +
					"Without it the pane has stopped accepting edits for no reason they can see.",
			});
		}
		// An agent that lost the board hears that before it is given another one,
		// or it would claim its way straight back onto a board somebody just took.
		if (refuseRevokedClaim(res, key)) return;
		const reason = body.reason.trim();

		const forMs =
			typeof body.forMs === "number" && Number.isFinite(body.forMs) ? body.forMs : undefined;
		void trackMutationWork(req, `${req.method} ${req.path} claim wait`, async (signal) => {
			const { claim, created } = await claimBoard({
				board: key,
				reason,
				...(forMs !== undefined ? { forMs } : {}),
				signal,
			});
			// Taking the board is the first thing the canvas tells this agent about
			// it, so it is where the record of what the agent has seen starts
			// (TASK-091). Without the seed the first write under a claim would be
			// the one write nothing checked, and the rest of the claimed work may
			// depend on it.
			const file = boards.get(key)?.file;
			const version = created
				? rememberVersionAt(claim.holder.id, file)
				: file
					? versionOfNoteAt(file)
					: null;
			res.json({ success: true, board: key, claim, created, version });
		}).catch((error) => {
			if (error instanceof BoardLockCancelledError && (req.aborted || res.destroyed)) return;
			answerBoardError(res, error);
		});
	} catch (error) {
		answerBoardError(res, error);
	}
});

/**
 * The agent is done, and the board goes back to being taken one write at a
 * time.
 *
 * Idempotent: releasing a claim that has expired, or that somebody took back,
 * answers `released: false` rather than failing. An agent tidying up after
 * losing the board is doing the right thing a moment late.
 */
app.post("/api/boards/claim/release", (req: Request, res: Response) => {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Releasing a claim");
		const claim = releaseClaim(key);
		res.json({ success: true, board: key, released: claim !== null, claim });
	} catch (error) {
		answerBoardError(res, error);
	}
});

// API Routes

// Get all elements
app.get("/api/elements", (req: Request, res: Response) => {
	try {
		const { key, content } = boardFromRequest(req, "Listing elements");
		const elementsArray = presentElements(content.elements.values(), {
			boardKey: key,
			checkoutSnapshot: checkoutSnapshotFor(res),
		});
		res.json({
			success: true,
			board: key,
			elements: elementsArray,
			count: elementsArray.length,
		});
	} catch (error) {
		answerBoardError(res, error, "Error fetching elements:");
	}
});

// Create new element
app.post("/api/elements", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Creating an element");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ stored: ServerElement }>(() => ({
				input: { upserts: [req.body], origin: "agent" },
				value: (applied) => ({ stored: applied.named[0] as ServerElement }),
			})),
			afterPersist: ({ value }) => {
				logger.info("Creating element via API", { type: value.stored.type, board: source.key });
			},
			answer: ({ content, value, delta, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				element: presentElement(value.stored, { boardKey: source.key, checkoutSnapshot }),
				// `element` is what the caller asked for; `elements` is what the board
				// became, label and z-order included (TASK-075).
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					[...delta.created, ...delta.updated],
					wantsDocument(req),
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error creating element:");
	}
});

// Mark one unavoidable proper connector crossing without changing either source.
app.post("/api/bridges", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Creating a connector bridge");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{
				plan: ReturnType<typeof planBridgeCreate>;
				generated: ServerElement[];
			}>((content) => {
				let plan: ReturnType<typeof planBridgeCreate>;
				try {
					const body = req.body && typeof req.body === "object" ? req.body : {};
					plan = planBridgeCreate({
						elements: [...content.elements.values()],
						bridgeId: mintId(content.elements),
						overConnectorId: String((body as Record<string, unknown>).over ?? ""),
						underConnectorId: String((body as Record<string, unknown>).under ?? ""),
						background: String((body as Record<string, unknown>).background ?? ""),
						...((body as Record<string, unknown>).at &&
						typeof (body as Record<string, unknown>).at === "object"
							? { at: (body as Record<string, unknown>).at as { x: number; y: number } }
							: {}),
					});
				} catch (error) {
					if (error instanceof BridgeRefusal)
						throw new BoardMutationError(400, error.message, error.code);
					throw error;
				}
				return {
					input: { upserts: [...plan.inputs], origin: "agent" },
					value: (applied) => ({ plan, generated: applied.named }),
				};
			}),
			answer: ({ content, value, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				bridgeId: value.plan.bridgeId,
				overConnectorId: value.plan.overConnectorId,
				underConnectorId: value.plan.underConnectorId,
				overSegmentIndex: value.plan.overSegmentIndex,
				underSegmentIndex: value.plan.underSegmentIndex,
				crossing: value.plan.crossing,
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					value.generated,
					false,
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error creating connector bridge:");
	}
});

// Provenance owns removal: source connectors may have moved or disappeared.
app.delete("/api/bridges/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Removing a connector bridge");
		const bridgeId = typeof req.params.id === "string" ? req.params.id : "";
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ deleted: readonly [string, string] }>((content) => {
				let deleted: readonly [string, string];
				try {
					deleted = planBridgeRemoval([...content.elements.values()], bridgeId);
				} catch (error) {
					if (error instanceof BridgeRefusal)
						throw new BoardMutationError(400, error.message, error.code);
					throw error;
				}
				return {
					input: { deletes: [...deleted], origin: "agent" },
					value: () => ({ deleted }),
				};
			}),
			answer: ({ content, value, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				bridgeId,
				deleted: value.deleted,
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					[],
					false,
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error removing connector bridge:");
	}
});

// Update element
app.put("/api/elements/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Updating an element");
		const { id } = req.params;
		const body = req.body && typeof req.body === "object" ? req.body : {};

		if (typeof id !== "string" || !id) {
			return res.status(400).json({
				success: false,
				error: "Element ID is required",
			});
		}

		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ touched: ServerElement[] }>((content) => {
				if (!content.elements.has(id)) {
					throw new BoardMutationError(404, `Element with ID ${id} not found`);
				}
				return {
					input: { upserts: [{ ...body, id }], origin: "agent" },
					value: (applied) => {
						const touched = new Map(
							[...applied.created, ...applied.updated].map((element) => [element.id, element]),
						);
						touched.set(id, applied.named[0] as ServerElement);
						return { touched: Array.from(touched.values()) };
					},
				};
			}),
			answer: ({ content, value, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				element: presentElement(content.elements.get(id) as ServerElement, {
					boardKey: source.key,
					checkoutSnapshot,
				}),
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					value.touched,
					wantsDocument(req),
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error updating element:");
	}
});

function clearSelectionForBoard(boardKeyToClear: string): void {
	for (const [clientId] of selectionState.byClient) {
		if (paneBoards.get(clientId) === boardKeyToClear) selectionState.byClient.delete(clientId);
	}
	const owner = selectionState.current?.clientId;
	if (owner && paneBoards.get(owner) === boardKeyToClear) {
		selectionState.current = null;
		broadcastSelection();
	}
}

// Clear all elements (must be before /:id route)
app.delete("/api/elements/clear", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Clearing a board");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: (content) => {
				const deleted = Array.from(content.elements.keys());
				content.elements.clear();
				return {
					value: { count: deleted.length },
					delta: { deleted },
				};
			},
			afterPersist: ({ value }) => {
				// Nothing is on this board, so nothing on it can be selected in any
				// pane showing it. A pane on another board keeps its pick.
				clearSelectionForBoard(source.key);
				logger.info(`Canvas cleared: ${value.count} elements removed from board "${source.key}"`);
			},
			answer: ({ value }) => ({
				success: true,
				board: source.key,
				message: `Cleared ${value.count} elements`,
				count: value.count,
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error clearing canvas:");
	}
});

// Delete element
app.delete("/api/elements/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Deleting an element");
		const { id } = req.params;

		if (typeof id !== "string" || !id) {
			return res.status(400).json({
				success: false,
				error: "Element ID is required",
			});
		}

		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ deleted: string[] }>((content) => {
				if (!content.elements.has(id)) {
					throw new BoardMutationError(404, `Element with ID ${id} not found`);
				}
				return {
					input: { deletes: [id], origin: "agent" },
					value: (applied) => ({ deleted: applied.deleted }),
				};
			}),
			answer: ({ content, value, delta, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				message: `Element ${id} deleted successfully`,
				...(value.deleted.length > 1 ? { alsoDeleted: value.deleted.slice(1) } : {}),
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					delta.updated,
					wantsDocument(req),
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error deleting element:");
	}
});

// Query elements with filters
app.get("/api/elements/search", (req: Request, res: Response) => {
	try {
		const { key, content } = boardFromRequest(req, "Querying elements");
		const { type, x_min, x_max, y_min, y_max, board: _boardParam, ...filters } = req.query;
		let results = Array.from(content.elements.values());

		// Filter by type if specified
		if (type && typeof type === "string") {
			results = results.filter((element) => element.type === type);
		}

		// Filter by bounding box if specified. An element is in the region when
		// any part of it is, measured from its path where it has one — asking
		// where an arrow starts is not asking where it goes (TASK-044).
		if (x_min !== undefined || x_max !== undefined || y_min !== undefined || y_max !== undefined) {
			const region = {
				xMin: x_min !== undefined ? Number(x_min) : -Infinity,
				xMax: x_max !== undefined ? Number(x_max) : Infinity,
				yMin: y_min !== undefined ? Number(y_min) : -Infinity,
				yMax: y_max !== undefined ? Number(y_max) : Infinity,
			};
			results = results.filter((el) => overlapsRegion(el, region));
		}

		// Apply additional exact-match filters
		if (Object.keys(filters).length > 0) {
			results = results.filter((element) => {
				return Object.entries(filters).every(([field, value]) => {
					return (element as unknown as Record<string, unknown>)[field] === value;
				});
			});
		}

		res.json({
			success: true,
			elements: presentElements(results, {
				boardKey: key,
				checkoutSnapshot: checkoutSnapshotFor(res),
			}),
			count: results.length,
		});
	} catch (error) {
		answerBoardError(res, error, "Error querying elements:");
	}
});

// Get element by ID
app.get("/api/elements/:id", (req: Request, res: Response) => {
	try {
		const { key, content } = boardFromRequest(req, "Getting an element");
		const elements = content.elements;
		const { id } = req.params;

		if (typeof id !== "string" || !id) {
			return res.status(400).json({
				success: false,
				error: "Element ID is required",
			});
		}

		const element = elements.get(id);

		if (!element) {
			return res.status(404).json({
				success: false,
				error: `Element with ID ${id} not found`,
			});
		}

		res.json({
			success: true,
			element: presentElement(element, {
				boardKey: key,
				checkoutSnapshot: checkoutSnapshotFor(res),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error fetching element:");
	}
});

// Batch create elements
app.post("/api/elements/batch", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Creating elements");
		const { elements: elementsToCreate, files: replacementFiles, mutation } = req.body ?? {};
		const replacesScene = mutation === SCENE_REPLACEMENT_MARKER;

		if (!Array.isArray(elementsToCreate)) {
			return res.status(400).json({
				success: false,
				error: "Expected an array of elements",
			});
		}
		if (replacesScene && !Array.isArray(replacementFiles)) {
			return res.status(400).json({
				success: false,
				error: "Expected an array of files for scene replacement",
			});
		}
		const replacementFileList = Array.isArray(replacementFiles) ? replacementFiles : [];

		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ count: number }>(() => ({
				input: { upserts: elementsToCreate, origin: "agent" },
				...(replacesScene ? { replaceScene: { files: replacementFileList } } : {}),
				value: (applied) => ({ count: applied.created.length }),
			})),
			...(replacesScene ? { afterPersist: () => clearSelectionForBoard(source.key) } : {}),
			answer: ({ content, value, delta, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				count: value.count,
				// `elements` here has always been what the write produced; the
				// fingerprint and the opt-in document are what TASK-075 adds.
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					[...delta.created, ...delta.updated],
					wantsDocument(req),
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error batch creating elements:");
	}
});

function mermaidElementInput(
	rendered: MermaidRenderJobResult,
	existingIds: Iterable<string>,
): unknown[] {
	if (rendered.elements.length === 0)
		throw new BoardMutationError(
			422,
			"Mermaid conversion returned no elements for non-empty source. The board was not changed.",
			"MERMAID_EMPTY_RESULT",
		);
	const used = new Set(existingIds);
	const ids = new Map<string, string>();
	for (const element of rendered.elements) {
		if (typeof element.id !== "string" || element.id.length === 0)
			throw new BoardMutationError(422, "Mermaid conversion returned an element without an id.");
		const id = derivedId(`mermaid:${element.id}`, used);
		used.add(id);
		ids.set(element.id, id);
	}
	return rendered.elements.map((element) => {
		const input = structuredClone(element) as unknown as Record<string, unknown>;
		const start = input.start as Record<string, unknown> | undefined;
		const end = input.end as Record<string, unknown> | undefined;
		return {
			...input,
			id: ids.get(element.id),
			...(start && typeof start.id === "string"
				? { start: { ...start, id: ids.get(start.id) } }
				: {}),
			...(end && typeof end.id === "string" ? { end: { ...end, id: ids.get(end.id) } } : {}),
		};
	});
}

// Mermaid is rendered in the private server renderer and committed once under
// the ordinary board lock and write boundary.
app.post(
	"/api/elements/from-mermaid",
	asyncEndpoint(async (req: Request, res: Response) => {
		try {
			const { mermaidDiagram, config } = req.body ?? {};
			if (typeof mermaidDiagram !== "string" || mermaidDiagram.trim().length === 0) {
				return res.status(400).json({
					success: false,
					error: "Mermaid diagram definition is required",
				});
			}
			const source = boardTargetFromRequest(req, "Mermaid conversion");
			const converted = await boardRenderer.execute({
				kind: "mermaid",
				source: mermaidDiagram,
				config:
					config && typeof config === "object" && !Array.isArray(config)
						? { ...DEFAULT_MERMAID_CONFIG, ...config }
						: DEFAULT_MERMAID_CONFIG,
			});
			if (converted.kind !== "mermaid")
				throw new BoardRendererError("Mermaid renderer returned the wrong result shape.", "result");
			if (converted.error)
				throw new BoardMutationError(
					422,
					`Mermaid conversion failed: ${converted.error}`,
					"MERMAID_INVALID",
				);
			answerBoardWrite(res, {
				source,
				origin: "agent",
				mutation: elementMutation((content) => ({
					input: {
						origin: "agent",
						upserts: mermaidElementInput(converted, content.elements.keys()) as never[],
					},
					addFiles: Object.values(converted.files),
					value: (applied) => {
						const elements = [...applied.created, ...applied.updated];
						return { count: elements.length, ids: elements.map((element) => element.id), elements };
					},
				})),
				answer: ({ content, value, delta, written, checkoutSnapshot }) => ({
					success: true,
					board: source.key,
					count: value.count,
					ids: value.ids,
					...agentWriteAnswer(
						source.key,
						source.board,
						content,
						[...delta.created, ...delta.updated],
						wantsDocument(req),
						written,
						checkoutSnapshot,
					),
				}),
			});
		} catch (error) {
			answerBoardError(res, error, "Error processing Mermaid diagram:");
		}
	}),
);

// ─── Change reports from the browser ──────────────────────────
//
// The browser reports what changed; the server decides what the board is.
//
// This replaces POST /api/elements/sync, which cleared the board's element map
// and refilled it from whatever a tab happened to be holding. That made every
// tab the authority on the entire board on every keystroke, so a tab that was
// stale, still loading, or showing a board mid-switch could truncate work it
// had never seen. Nothing here can do that: the server removes only ids a
// client names explicitly, and a client can only name ids it received in the
// first place.
//
// Upserts are merged, not substituted, so server-side fields the browser does
// not model — createdAt, the monotonic version, anything a later feature
// stamps on an element — survive a human dragging the shape.
//
// It is also the one route an agent writes a whole intent through. Aligning
// twenty boxes is one thing somebody asked for, and it costs one write here
// rather than twenty (ADR 0015, TASK-068). Who is writing decides two things
// and nothing else — see `origin`.
const ElementChangesSchema = z.object({
	upserts: z.array(z.record(z.string(), z.unknown())).default([]),
	deletes: z.array(z.string()).default([]),
	/**
	 * Who is writing. Absent means the browser, which was this route's only
	 * writer when it was written: its elements are stamped `frontend_sync` and
	 * the feed is told a human moved them.
	 *
	 * An agent says so and gets neither. Stamping its own drawing `frontend_sync`
	 * would make it indistinguishable from a user edit, and calling it human
	 * to the feed would make it eligible to be narrated back into the agent's own
	 * thread (ADR 0005).
	 */
	origin: z.enum(["human", "agent"]).default("human"),
	clientId: z.string().optional(),
	timestamp: z.string().optional(),
	/**
	 * "This is the whole board, as it stands on my screen."
	 *
	 * The one thing a pane is otherwise never allowed to say (TASK-016): a pane
	 * sends a delta against what it has been sent, so that a stale or half-loaded
	 * tab cannot name — and so cannot delete — an element it has never seen.
	 *
	 * It is allowed on a board that has stopped saving, and nowhere else. The
	 * note there belongs to another editor, so the board archboard would
	 * otherwise hold is their scene plus the last pending user edit, which
	 * is not what anybody is looking at and not what the three outcomes should
	 * act on. The pane sends its full scene once, and from then on overwrite
	 * means what CLAUDE.md's table says it means. Nothing is written to the vault
	 * by it — a held board writes to nothing — so the worst a wrong one can do is
	 * change what a human sees they are about to choose between.
	 */
	fullReport: z.boolean().default(false),
});

/** Did this caller ask for the whole board? Off unless said, on every surface. */
function wantsDocument(req: Request): boolean {
	const asked =
		req.query.document ??
		(req.body && typeof req.body === "object" ? req.body.document : undefined);
	return asked === true || asked === "1" || asked === "true";
}

app.post("/api/elements/changes", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "A change report");
		const { upserts, deletes, origin, clientId, timestamp, fullReport } =
			ElementChangesSchema.parse(req.body ?? {});
		const presentationLinks = new Map(
			upserts.flatMap((upsert) => {
				if (typeof upsert.id !== "string") return [];
				const context = presentationContextFromElement(upsert, source.key);
				return context ? ([[upsert.id, context]] as const) : [];
			}),
		);
		const input: ElementInputRequest =
			origin === "agent"
				? {
						origin,
						upserts: upserts.map((upsert) => AgentElementInputSchema.parse(upsert)),
						deletes,
						presentationLinks,
					}
				: {
						origin,
						upserts: upserts.map((upsert) => HumanElementChangeSchema.parse(upsert)),
						deletes,
						presentationLinks,
						...(timestamp === undefined ? {} : { timestamp }),
					};
		const writerKind = res.locals.boardWriterKind as "human" | "agent";
		answerBoardWrite(res, {
			source,
			origin,
			clientId,
			presentationLinks,
			mutation: elementMutation<null>(() => {
				// A pane may send its whole screen only while this board is held. The
				// check and the clear both happen inside the isolated mutation, before
				// any note can be written.
				if (fullReport && writerKind === "agent") {
					throw new BoardMutationError(
						400,
						"A full report is a pane sending its whole scene. An agent must send a delta.",
					);
				}
				if (fullReport && !isHeld(source.key)) {
					throw new BoardMutationError(
						400,
						`"${source.key}" is saving normally, so a full report would be a whole-scene write. ` +
							"Report a delta against what this pane has been sent.",
					);
				}
				return {
					input,
					wholeScene: fullReport,
					value: () => null,
				};
			}),
			afterPersist: ({ content, delta }) => {
				logger.info(
					`Change report from ${clientId ?? (writerKind === "agent" ? "an agent" : "an unidentified client")} ` +
						`on "${source.key}": ` +
						`+${delta.created.length} ~${delta.updated.length} -${delta.deleted.length} ` +
						`(${content.elements.size} on the board)`,
				);
			},
			answer: (context) => {
				const { content, delta, written, appliedAt } = context;
				return {
					success: true,
					board: source.key,
					created: delta.created.length,
					updated: delta.updated.length,
					deleted: delta.deleted.length,
					count: content.elements.size,
					appliedAt,
					// An agent keeps the established pessimistic answer. A pane gets a
					// compact post-persistence acknowledgement, except for the explicit
					// held-board full-report recovery path (TASK-074/075/118).
					...(writerKind === "agent"
						? agentWriteAnswer(
								source.key,
								source.board,
								content,
								[...delta.created, ...delta.updated],
								wantsDocument(req),
								written,
								context.checkoutSnapshot,
							)
						: humanWriteAnswer(context, fullReport)),
				};
			},
		});
	} catch (error) {
		answerBoardError(res, error, "Error applying a change report:");
	}
});

// ─── Change feed ──────────────────────────────────────────────
//
// Semantic changes, not element deltas: what the board *became*, said in the
// same vocabulary `compare` uses. See core/change-feed.ts for why an event
// exists at all — briefly, a drag is one event, at rest, or none at all.
//
// Two shapes, because there are two consumers:
//   ?since=N            the events after cursor N, for something watching live
//   ?since=N&coalesce=1 one diff from cursor N to now, for a per-turn hook that
//                       wants the net difference rather than a replay to merge
//
// `detail` (the whole compare result) is off unless asked: it is complete and
// therefore large, and the narration in `text` is what most callers use.
app.get("/api/changes", (req: Request, res: Response) => {
	try {
		const since = Number(req.query.since ?? 0);
		if (!Number.isFinite(since) || since < 0) {
			return res
				.status(400)
				.json({ success: false, error: "since must be a cursor from a previous response" });
		}
		const { key: board } = boardFromRequest(req, "changes");
		const wantDetail = req.query.detail === "1" || req.query.detail === "true";
		const coalesce = req.query.coalesce === "1" || req.query.coalesce === "true";
		// A caller reading the feed wants the board as it is, not as it was 1.2s
		// ago, so pending settle work is completed before answering.
		if (req.query.settle !== "0") changeFeed.settle(board);

		// A cursor ahead of the feed's own is not "nothing has happened": it came
		// from a previous canvas process, since the board lives in memory and the
		// count restarts with it. Saying "nothing changed" to that would be the
		// most damaging wrong answer available.
		if (since > changeFeed.cursor) {
			return res.json({
				success: true,
				board,
				feedId: changeFeed.status().feedId,
				cursor: changeFeed.cursor,
				events: [],
				...(coalesce ? { coalesced: null } : {}),
				truncated: true,
				message:
					`Cursor ${since} is ahead of this feed (now at ${changeFeed.cursor}), so it was issued by a previous ` +
					"canvas process — the board is held in memory and the count restarts with the server. Treat this as " +
					"a fresh start: take the cursor in this response, and read the board with `describe`. Watch `feedId` " +
					"to notice the next restart.",
			});
		}

		const strip = (event: ChangeEvent) =>
			wantDetail ? event : { ...event, change: { ...event.change, detail: undefined } };

		if (coalesce) {
			const netDiff = changeFeed.coalesce(since, board);
			if (!netDiff) {
				return res.json({
					success: true,
					board,
					cursor: changeFeed.cursor,
					coalesced: null,
					truncated: true,
					message:
						`Cursor ${since} is older than the change feed's memory of board "${board}", so the net diff ` +
						"since then cannot be computed. Take the cursor in this response as a fresh start, and read " +
						"the board itself with `describe` if you need to know where things stand.",
				});
			}
			return res.json({
				success: true,
				board,
				feedId: changeFeed.status().feedId,
				cursor: netDiff.cursor,
				since: netDiff.since,
				events: netDiff.events.map(strip),
				coalesced: {
					significance: netDiff.change.significance,
					headline: netDiff.change.headline,
					text: narrateChange(netDiff.change),
					counts: netDiff.change.counts,
					nodes: netDiff.change.nodes,
					edges: netDiff.change.edges,
					layout: netDiff.change.layout,
					warnings: netDiff.change.warnings,
					...(wantDetail ? { detail: netDiff.change.detail } : {}),
				},
			});
		}

		res.json({
			success: true,
			board,
			feedId: changeFeed.status().feedId,
			cursor: changeFeed.cursor,
			events: changeFeed.since(since, board).map(strip),
			feed: changeFeed.status(),
		});
	} catch (error) {
		logger.error("Error reading the change feed:", error);
		res.status(400).json({ success: false, error: (error as Error).message });
	}
});

// ─── Selection ────────────────────────────────────────────────
//
// Selection is what a human has picked on the board, and it changes on every
// click — far more often than the scene itself. So it gets its own channel
// rather than riding the debounced element sync: the browser posts ids only
// (tens of bytes), and reading it back never re-transmits the scene.
//
// One selection per pane, keyed by client id, plus a last-writer-wins `current`
// for the callers that ask for "the selection" without naming a pane. When a
// client disconnects its selection is dropped with it.

const SelectionSchema = z.object({
	elementIds: z.array(z.string()),
	clientId: z.string().min(1),
});

// Boardless: a selection names the client that made it, and a pane that reads
// this decides what to do with it by whose it is, not by which board it is on.
// Tagging it with a board would only give panes on other boards a reason to
// drop a message that was never about their board in the first place.
function broadcastSelection(): void {
	const current = selectionState.current;
	broadcastBoardless({
		type: "selection_changed",
		elementIds: current?.elementIds ?? [],
		clientId: current?.clientId ?? null,
		at: current?.at ?? new Date().toISOString(),
	});
}

app.post("/api/selection", (req: Request, res: Response) => {
	const parsed = SelectionSchema.safeParse(req.body);
	if (!parsed.success) {
		return res
			.status(400)
			.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid selection" });
	}

	const { elementIds, clientId } = parsed.data;
	const at = new Date().toISOString();
	selectionState.current = elementIds.length === 0 ? null : { elementIds, clientId, at };
	// Per pane, an empty selection is a fact about that pane rather than the
	// absence of one: the human deselected *there* while another pane may still
	// hold something.
	if (elementIds.length === 0) selectionState.byClient.delete(clientId);
	else selectionState.byClient.set(clientId, { elementIds, clientId, at });

	logger.info(`Selection from ${clientId}: ${elementIds.length} element(s)`);
	broadcastSelection();

	res.json({
		success: true,
		count: elementIds.length,
		elementIds,
	});
});

app.get("/api/selection", (_req: Request, res: Response) => {
	// Named out of the board the selecting pane is holding, which with two panes
	// on two boards is the only place those ids exist. No resolution and no
	// ambiguity: whoever picked the elements settles which board they are on.
	const owner = selectionState.current?.clientId;
	const key = (owner ? paneBoards.get(owner) : undefined) ?? SCRATCH_KEY;
	const board = boards.get(key);
	const report = buildSelectionReport(
		selectionState.current,
		board
			? presentElements(boardElements(board), {
					boardKey: key,
					checkoutSnapshot: checkoutSnapshotFor(res),
				})
			: [],
		clients.size,
	);
	res.json({ success: true, board: key, ...report });
});

// ─── Panes ────────────────────────────────────────────────────
//
// What the human is currently looking at: which pane holds which board, where
// it sits on the display, how much of the board is on screen, and what is picked
// in it. View state, never contents — see core/panes.ts for why that line is
// worth holding.
//
// Like selection, this is pushed by the browser and read back off the server,
// so reading it costs a map lookup and never a browser round-trip.

const RectSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});

const PaneSchema = z.object({
	clientId: z.string().min(1),
	paneId: z.string().min(1),
	// The board this pane adopted — what it is actually rendering, which is what
	// makes the report a description of the displayed scene rather than an echo
	// of what
	// the server thinks it sent.
	board: z.string().min(1),
	primary: z.boolean(),
	focused: z.boolean(),
	elementCount: z.number().int().nonnegative(),
	rect: RectSchema,
	viewport: RectSchema.extend({ zoom: z.number().positive() }),
	// Which bundle this tab is running. Optional: a tab from before this existed,
	// and anything that is not a browser, simply says nothing and hears nothing.
	build: z.string().optional(),
});

// A pane says what it is showing, and hears back whether it is out of date.
//
// This is the pulse a browser already has. A pane posts here when it connects,
// on every change, and on every scroll, resize and zoom, so a tab that was
// opened before somebody rebuilt the frontend finds out at its next
// interaction. The alternative on offer was for the tab to discover it by
// having a command time out on it ten seconds later, which is what used to
// happen and what TASK-056 is about.
app.post("/api/panes", (req: Request, res: Response) => {
	const parsed = PaneSchema.safeParse(req.body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const field = issue?.path.length ? issue.path.join(".") : "request";
		return res.status(400).json({
			success: false,
			error: `Invalid pane telemetry at ${field}: ${issue?.message ?? "invalid value"}`,
		});
	}
	const frontend = frontendState(parsed.data.build);
	const staleFrontend = frontend.stale ? frontend : undefined;
	const registration: PaneRegistration = { ...parsed.data, at: new Date().toISOString() };
	// A pane exists exactly as long as its socket. A report arriving without one
	// is a pane on its way out — React tears the canvas down in its own order, so
	// a last change can be reported after the close — and registering it would
	// resurrect the ghost the close just retired.
	const live = Array.from(clientIds.values()).includes(registration.clientId);
	if (!live) {
		return res.json({ success: true, registered: false, paneCount: panes.size, staleFrontend });
	}
	const isNew = !panes.has(registration.clientId);
	panes.set(registration.clientId, registration);
	// A pane that was asked for has arrived. Registration is the acknowledgement
	// — see the pane layout section below for why it is that and not a reply.
	if (isNew) notePaneOpened(registration);
	res.json({ success: true, registered: true, paneCount: panes.size, staleFrontend });
});

app.get("/api/panes", (_req: Request, res: Response) => {
	const report = buildPanesReport(Array.from(panes.values()), {
		identity: (key) => boards.get(key)?.identity ?? null,
		elements: (key) => {
			const board = boards.get(key);
			return board
				? presentElements(boardElements(board), {
						boardKey: key,
						checkoutSnapshot: checkoutSnapshotFor(res),
					})
				: [];
		},
		selection: (clientId) => selectionState.byClient.get(clientId) ?? null,
		canvasUrl: `http://${formatHostForUrl(HOST)}:${PORT}`,
	});
	res.json({ success: true, ...report });
});

// ─── Pane layout ──────────────────────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. That made splitting something
// only a user could do: an agent told to put a proposal beside the current
// architecture had no second pane and no way to ask for one, so it reused the
// pane in front of the human and overwrote what was there (TASK-033).
//
// These two routes ask the browser to change its layout and then wait for the
// registry to agree. The acknowledgement is the pane appearing in `panes` or
// its socket closing — never a promise from the shell — because a registration
// is the only evidence anywhere in this file that a pane exists.

// How long these two routes wait is in core/timing.ts, because the settle cap
// is waiting out PANE_DEBOUNCE_MS, which is a number on the other side of the
// browser boundary. PANE_LAYOUT_TIMEOUT_MS and PANE_SETTLE_CAP_MS are there
// with the reasoning that used to be here.

interface PendingPaneOpen {
	resolve: (pane: PaneRegistration) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	/** The panes that already existed, so the new one can be told from them. */
	known: Set<string>;
}
const pendingPaneOpens = new Set<PendingPaneOpen>();

interface PendingPaneClose {
	clientId: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}
const pendingPaneCloses = new Set<PendingPaneClose>();

function notePaneOpened(registration: PaneRegistration): void {
	for (const pending of pendingPaneOpens) {
		if (pending.known.has(registration.clientId)) continue;
		pendingPaneOpens.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve(registration);
	}
}

function notePaneClosed(clientId: string): void {
	for (const pending of pendingPaneCloses) {
		if (pending.clientId !== clientId) continue;
		pendingPaneCloses.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve();
	}
}

/** No pane means no browser, which is a different thing from a bad request. */
function noBrowserBody(what: string): Record<string, unknown> {
	return {
		success: false,
		code: "BROWSER_REQUIRED",
		error:
			`${what} needs a canvas open in a browser. A pane exists only while a tab is rendering it, ` +
			`so there is nothing on screen to split or close. Open http://${formatHostForUrl(HOST)}:${PORT} and retry.`,
	};
}

/**
 * Wait until every pane has reported itself since the layout was asked for.
 *
 * The answer to a layout change names where a pane ended up, and "left" and
 * "right" are read off the rectangles the panes report. So the report has to
 * be the one taken after the shell re-laid them out, not the one from before.
 */
async function settleAfterLayout(askedAt: string): Promise<void> {
	const deadline = Date.now() + PANE_SETTLE_CAP_MS;
	while (Date.now() < deadline) {
		const all = Array.from(panes.values());
		if (all.length > 0 && all.every((pane) => pane.at > askedAt)) return;
		await sleep(50);
	}
}

// Split the canvas: one more pane, side by side with what is already there.
//
// It takes no board. What lands in the new pane is a separate act — `board
// open ... --pane <the pane this answered with>` — so that opening a board
// stays the one thing that decides which board a pane holds (ADR 0009).
app.post(
	"/api/panes/open",
	asyncEndpoint(async (req: Request, res: Response) => {
		const answering = primaryPane();
		if (!answering) return res.status(503).json(noBrowserBody("Opening a pane"));

		if (panes.size >= MAX_PANES) {
			const showing = panesInOrder(Array.from(panes.values()))
				.map(
					(entry) => `${entry.place} (${paneBoards.get(entry.pane.clientId) ?? entry.pane.board})`,
				)
				.join(", ");
			return res.status(409).json({
				success: false,
				error:
					`The canvas is already showing ${panes.size} panes: ${showing}. ` +
					"Point one of them at another board with `board open <name> --pane <spec>`, " +
					"or close one first with `pane close <spec>`.",
			});
		}

		const askedAt = new Date().toISOString();
		let pending!: PendingPaneOpen;
		const opened = new Promise<PaneRegistration>((resolve, reject) => {
			pending = {
				resolve,
				reject,
				known: new Set(panes.keys()),
				timeout: setTimeout(() => {
					pendingPaneOpens.delete(pending);
					reject(
						new Error(
							"The browser was asked for another pane and none appeared within 10 seconds. " +
								"The tab may be running an older build of the canvas — reload it and try again.",
						),
					);
				}, PANE_LAYOUT_TIMEOUT_MS),
			};
			pendingPaneOpens.add(pending);
		});

		if (!sendLayoutToPane(answering.clientId, { type: "pane_open" })) {
			pendingPaneOpens.delete(pending);
			clearTimeout(pending.timeout);
			return res.status(503).json(noBrowserBody("Opening a pane"));
		}

		try {
			const pane = await opened;
			await settleAfterLayout(askedAt);
			logger.info(`Pane opened on request: ${pane.paneId} (${panes.size} on screen)`);
			res.json({
				success: true,
				...paneResponse(panes.get(pane.clientId) ?? pane),
				paneCount: panes.size,
				onScreen: boardsOnScreen(),
			});
		} catch (error) {
			res.status(504).json({ success: false, error: (error as Error).message });
		}
	}),
);

// Close one pane, named the way every other pane is named.
//
// Always named: unlike opening a board, which can only land somewhere visible
// and wrong, closing takes a board off the screen, and guessing which one is
// the mistake that costs the human the half they were reading.
app.post(
	"/api/panes/close",
	asyncEndpoint(async (req: Request, res: Response) => {
		const spec = typeof req.body?.pane === "string" ? req.body.pane.trim() : "";
		const registrations = Array.from(panes.values());

		if (registrations.length === 0) return res.status(503).json(noBrowserBody("Closing a pane"));

		if (registrations.length === 1) {
			return res.status(409).json({
				success: false,
				error:
					"That is the only pane on screen, and closing it would leave the canvas showing nothing " +
					"with no way back except reloading the browser. Its board is unaffected either way — " +
					"point the pane somewhere else with `board open <name>` instead.",
			});
		}

		let target: PaneRegistration;
		let place: string;
		try {
			if (!spec) {
				throw new Error(
					"Say which pane to close. " +
						panesInOrder(registrations)
							.map((entry) => `\`pane close ${entry.place}\` drops ${entry.pane.board}`)
							.join(", ") +
						".",
				);
			}
			target = resolvePaneSpec(registrations, spec);
			place =
				panesInOrder(registrations).find((entry) => entry.pane.clientId === target.clientId)
					?.place ?? spec;
		} catch (error) {
			return res.status(400).json({ success: false, error: (error as Error).message });
		}

		const askedAt = new Date().toISOString();
		let pending!: PendingPaneClose;
		const closed = new Promise<void>((resolve, reject) => {
			pending = {
				clientId: target.clientId,
				resolve,
				reject,
				timeout: setTimeout(() => {
					pendingPaneCloses.delete(pending);
					reject(
						new Error(
							`The browser was asked to close the ${place} pane and it is still there after 10 seconds. ` +
								"The tab may be running an older build of the canvas — reload it and try again.",
						),
					);
				}, PANE_LAYOUT_TIMEOUT_MS),
			};
			pendingPaneCloses.add(pending);
		});

		if (!sendLayoutToPane(target.clientId, { type: "pane_close" })) {
			pendingPaneCloses.delete(pending);
			clearTimeout(pending.timeout);
			return res.status(503).json(noBrowserBody("Closing a pane"));
		}

		try {
			await closed;
			await settleAfterLayout(askedAt);
			logger.info(`Pane closed on request: ${target.paneId} (${panes.size} left on screen)`);
			res.json({
				success: true,
				closed: { paneId: target.paneId, clientId: target.clientId, place, board: target.board },
				paneCount: panes.size,
				onScreen: boardsOnScreen(),
			});
		} catch (error) {
			res.status(504).json({ success: false, error: (error as Error).message });
		}
	}),
);

// ─── Files API (for image elements) ───────────────────────────
//
// Board-scoped, like every other route that touches board content. An image is
// board content: it is drawn by an element on one board, and the note that
// board is saved to is where it belongs. These used to be boardless, over one
// map per process keyed by file id, which is what put board B's pictures in
// board A's note (TASK-060, ADR 0009, ADR 0015).

// GET the images one board holds
app.get("/api/files", (req: Request, res: Response) => {
	try {
		const { key, content } = boardFromRequest(req, "Listing images");
		res.json({ success: true, board: key, files: boardFilesMessage(content).files ?? {} });
	} catch (error) {
		answerBoardError(res, error);
	}
});

// POST add/update images on one board (batch)
app.post("/api/files", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Adding an image");
		const body = req.body;
		const fileList: ExcalidrawFile[] = Array.isArray(body) ? body : body?.files || [];
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: (content) => {
				const accepted = fileList
					.map((file) => usableEmbeddedFile(file))
					.filter((file): file is ExcalidrawFile => file !== null);
				for (const file of accepted) content.files.set(file.id, file);
				// A note keeps only images an element on this board draws (TASK-060).
				const drawn = drawnFileIds(content.elements.values());
				const orphaned = accepted.filter((file) => !drawn.has(file.id)).map((file) => file.id);
				return {
					value: { orphaned },
					delta: { filesAdded: accepted },
				};
			},
			answer: ({ value }) => ({
				success: true,
				board: source.key,
				count: fileList.length - value.orphaned.length,
				...(value.orphaned.length
					? {
							orphaned: value.orphaned,
							warning:
								`No element on "${source.key}" draws ${value.orphaned.join(", ")}, so ` +
								`${value.orphaned.length === 1 ? "it was" : "they were"} not kept: a note holds the images ` +
								"its own elements reference. Create the image element first, then post its data.",
						}
					: {}),
			}),
		});
	} catch (error) {
		answerBoardError(res, error);
	}
});

// DELETE an image from one board
app.delete("/api/files/:id", (req: Request, res: Response) => {
	try {
		const source = boardTargetFromRequest(req, "Deleting an image");
		const id = req.params.id as string;
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: (content) => {
				if (!content.files.delete(id)) {
					throw new BoardMutationError(404, `No image "${id}" on board "${source.key}".`);
				}
				return {
					value: null,
					delta: { filesDeleted: [id] },
				};
			},
			answer: () => ({ success: true, board: source.key }),
		});
	} catch (error) {
		answerBoardError(res, error);
	}
});

const boardRenderRequestSchema = z.object({
	format: z.enum(["png", "svg"]),
	background: z.boolean().default(true),
	padding: z.number().int().min(0).max(128).default(16),
	scale: z.number().min(0.25).max(4).default(1),
});

function copiedRenderSnapshot(
	scene: NonNullable<ReturnType<typeof readBoardInspectionSnapshot>["renderScene"]>,
): BoardRenderSnapshot {
	return structuredClone(scene) as unknown as BoardRenderSnapshot;
}

// Named-board image render: one persisted snapshot, no pane, camera, or browser client.
app.post(
	"/api/render/board",
	asyncEndpoint(async (req: Request, res: Response) => {
		try {
			const asked = boardOfRequest(req);
			if (!asked)
				throw new BoardRequiredError(
					listBoards().map((entry) => entry.key),
					"Rendering a board",
				);
			const options = boardRenderRequestSchema.parse(req.body ?? {});
			const snapshot = readBoardInspectionSnapshot(asked);
			if (!snapshot.renderScene)
				throw new BoardMutationError(
					422,
					`Board "${snapshot.board}" has persisted elements that cannot be rendered. Correct the note and try again.`,
					"BOARD_NOT_RENDERABLE",
				);
			const rendered = await boardRenderer.execute({
				kind: "render",
				snapshot: copiedRenderSnapshot(snapshot.renderScene),
				outputs: [
					{
						id: "board",
						kind: "full",
						format: options.format,
						background: options.background,
						padding: options.padding,
						scale: options.scale,
					},
				],
			});
			if (rendered.kind !== "render" || rendered.outputs.length !== 1) {
				if (rendered.kind === "render" && rendered.error)
					throw new BoardMutationError(422, rendered.error, "BOARD_NOT_RENDERABLE");
				throw new BoardRendererError("Board renderer returned the wrong result shape.", "result");
			}
			const output = rendered.outputs[0]!;
			res.json({
				success: true,
				board: snapshot.board,
				sourceFingerprint: snapshot.fingerprint,
				format: output.format,
				data: output.data,
				width: output.width,
				height: output.height,
				padding: options.padding,
				scale: options.scale,
				background: options.background,
				backgroundColor: snapshot.renderScene.appState.viewBackgroundColor,
			});
		} catch (error) {
			answerBoardError(res, error, "Error rendering board");
		}
	}),
);

// Focused finding render: inspection and every PNG use the same persisted snapshot.
app.post(
	"/api/export/findings",
	asyncEndpoint(async (req: Request, res: Response) => {
		try {
			const asked = boardOfRequest(req);
			if (!asked) {
				return res
					.status(400)
					.json({ success: false, error: "Rendering findings requires a board." });
			}
			const policy = InspectionPolicyInputSchema.parse(req.body?.policy ?? {});
			const snapshot = readBoardInspectionSnapshot(asked);
			const report = inspectBoard(snapshot.elements, policy);
			const requests = report.findings.flatMap((finding, findingIndex) =>
				finding.focusBBox ? [{ findingIndex, focusBBox: finding.focusBBox }] : [],
			);
			const base = {
				board: snapshot.board,
				sourceFingerprint: snapshot.fingerprint,
				report,
				sourceRenderable: snapshot.renderScene !== null,
			};
			if (!snapshot.renderScene || requests.length === 0) return res.json({ ...base, results: [] });
			const rendered = await boardRenderer.execute({
				kind: "render",
				snapshot: copiedRenderSnapshot(snapshot.renderScene),
				outputs: requests.map(({ findingIndex, focusBBox }) => {
					const dimensions = findingRasterDimensions(focusBBox);
					return {
						id: String(findingIndex),
						kind: "focus" as const,
						format: "png" as const,
						background: true as const,
						frame: focusBBox,
						...dimensions,
					};
				}),
			});
			if (rendered.kind !== "render")
				throw new BoardRendererError("Finding renderer returned the wrong result shape.", "result");
			if (rendered.error)
				return res.json({
					...base,
					sourceRenderable: false,
					results: [],
					error: rendered.error,
				});
			const byId = new Map(rendered.outputs.map((output) => [output.id, output]));
			const results = requests.map(({ findingIndex }) => {
				const output = byId.get(String(findingIndex));
				return output
					? { findingIndex, data: output.data }
					: { findingIndex, failure: "renderer-failed" as const };
			});
			if (!res.destroyed) res.json({ ...base, results });
		} catch (error) {
			if (!res.destroyed) answerBoardError(res, error, "Error rendering board findings");
		}
	}),
);

// Browser capture: request (CLI -> Express -> WebSocket -> Frontend)
interface PendingBrowserCapture {
	resolve: (data: { format: string; data: string }) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	collectionTimeout: ReturnType<typeof setTimeout> | null;
	bestResult: { format: string; data: string } | null;
}
const pendingBrowserCaptures = new Map<string, PendingBrowserCapture>();

app.post("/api/browser/capture", (req: Request, res: Response) => {
	try {
		const { format, background, pane } = req.body ?? {};

		if (!format || !["png", "svg"].includes(format)) {
			return res.status(400).json({
				success: false,
				error: 'format must be "png" or "svg"',
			});
		}

		if (clients.size === 0) {
			return res.status(503).json(noBrowserBody("Taking a picture of the canvas"));
		}

		// Which pane is photographed. Resolved before anything is promised, and
		// named for the same reason the camera is: with a proposal in the second
		// pane, an agent that can only ever picture the first cannot see the thing
		// it just drew (TASK-033).
		const answering =
			typeof pane === "string" && pane.trim()
				? resolvePaneSpec(Array.from(panes.values()), pane)
				: primaryPane();
		if (!answering) {
			return res.status(503).json(noBrowserBody("Taking a picture of the canvas"));
		}

		const requestId = mintId(pendingBrowserCaptures);

		const capturePromise = new Promise<{ format: string; data: string }>((resolve, reject) => {
			const timeout = setTimeout(() => {
				const pending = pendingBrowserCaptures.get(requestId);
				pendingBrowserCaptures.delete(requestId);
				// If we collected any result during the window, use it
				if (pending?.bestResult) {
					resolve(pending.bestResult);
				} else {
					reject(new Error("Browser capture timed out after 30 seconds"));
				}
			}, BROWSER_EXPORT_TIMEOUT_MS);

			pendingBrowserCaptures.set(requestId, {
				resolve,
				reject,
				timeout,
				collectionTimeout: null,
				bestResult: null,
			});
		});

		// Re-send the board to the pane that will answer, so a stale tab captures
		// what the server holds rather than what it last happened to render. Sent
		// to that pane alone and carrying that pane's own board: broadcasting it
		// would replace every other pane's scene with this one's board, which is
		// exactly the yank per-pane boards exist to prevent.
		const captureKey = paneBoards.get(answering.clientId) ?? answering.board;
		const captureBoard = boards.get(captureKey);
		if (!captureBoard) {
			return res.status(409).json({
				success: false,
				error: `The pane being pictured is showing "${captureKey}", which this canvas no longer holds.`,
			});
		}
		const captureContent = readBoardContent(captureBoard);
		sendToPane(
			answering.clientId,
			{
				type: "initial_elements",
				board: captureKey,
				identity: captureBoard.identity,
				elements: presentElements(captureContent.elements.values(), {
					boardKey: captureKey,
					checkoutSnapshot: checkoutSnapshotFor(res),
				}),
				...boardFilesMessage(captureContent),
			} as InitialElementsMessage & { files?: Record<string, ExcalidrawFile> },
			captureKey,
		);

		// Give the browser time to process the reload before requesting capture.
		setTimeout(() => {
			sendToPane(
				answering.clientId,
				{
					type: "browser_capture_request",
					requestId,
					format,
					background: background ?? true,
				},
				captureKey,
			);
		}, 800);

		capturePromise
			.then((result) => {
				return res.json({
					success: true,
					format: result.format,
					data: result.data,
				});
			})
			.catch((error) => {
				res.status(500).json({
					success: false,
					error: (error as Error).message,
				});
			});
	} catch (error) {
		logger.error("Error initiating browser capture:", error);
		// A pane spec that names nothing is the caller's mistake, not a fault.
		res.status(boardErrorStatus(error)).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Browser capture: result (Frontend -> Express -> CLI)
app.post("/api/browser/capture/result", (req: Request, res: Response) => {
	try {
		const { requestId, format, data, error } = req.body;

		if (!requestId) {
			return res.status(400).json({
				success: false,
				error: "requestId is required",
			});
		}

		const pending = pendingBrowserCaptures.get(requestId);
		if (!pending) {
			// Already resolved by another client, or expired — ignore silently
			return res.json({ success: true });
		}

		if (error) {
			// Don't reject on error — another WebSocket client may still succeed.
			logger.warn(`Browser capture error from one client (requestId=${requestId}): ${error}`);
			return res.json({ success: true });
		}

		// Keep the largest response (most complete canvas state wins)
		if (!pending.bestResult || data.length > pending.bestResult.data.length) {
			pending.bestResult = { format, data };
		}

		// Start a short collection window on the first response, then resolve with best
		if (!pending.collectionTimeout) {
			pending.collectionTimeout = setTimeout(() => {
				const p = pendingBrowserCaptures.get(requestId);
				if (p?.bestResult) {
					clearTimeout(p.timeout);
					pendingBrowserCaptures.delete(requestId);
					p.resolve(p.bestResult);
				}
			}, 3000);
		}

		res.json({ success: true });
	} catch (error) {
		logger.error("Error processing browser capture result:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Viewport control: request (CLI -> Express -> WebSocket -> Frontend)
interface PendingViewport {
	resolve: (data: { success: boolean; message: string }) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}
const pendingViewports = new Map<string, PendingViewport>();

const viewportRequestSchema = z
	.object({
		scrollToContent: z.boolean().optional(),
		scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
		viewportZoomFactor: z.number().positive().max(1).optional(),
		scrollToElementId: z.string().min(1).optional(),
		zoom: z.number().min(0.1).max(10).optional(),
		offsetX: z.number().optional(),
		offsetY: z.number().optional(),
		// Which pane's camera. Display, so it defaults where it cannot be wrong: one
		// pane and it is that one. With two, framing the pane nobody asked for moves
		// the browser pane the user was viewing, so naming it is how an agent
		// says which board it means to look at (TASK-033).
		pane: z.string().min(1).optional(),
	})
	.superRefine((params, ctx) => {
		const modes = [
			params.scrollToContent === true,
			params.scrollToElementIds !== undefined,
			params.scrollToElementId !== undefined,
			params.zoom !== undefined || params.offsetX !== undefined || params.offsetY !== undefined,
		].filter(Boolean).length;

		if (modes !== 1) {
			ctx.addIssue({
				code: "custom",
				message:
					"Specify exactly one viewport mode: scrollToContent, scrollToElementIds, scrollToElementId, or manual zoom/offset",
			});
		}
		if (
			params.viewportZoomFactor !== undefined &&
			params.scrollToContent !== true &&
			params.scrollToElementIds === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["viewportZoomFactor"],
				message: "viewportZoomFactor requires scrollToContent or scrollToElementIds",
			});
		}
	});

app.post("/api/viewport", (req: Request, res: Response) => {
	try {
		const {
			scrollToContent,
			scrollToElementIds,
			scrollToElementId,
			viewportZoomFactor,
			zoom,
			offsetX,
			offsetY,
			pane,
		} = viewportRequestSchema.parse(req.body);

		if (clients.size === 0) {
			return res.status(503).json(noBrowserBody("Moving the camera"));
		}

		// Resolved before anything is promised, so a pane spec that names nothing
		// comes back as a refusal listing the panes rather than as a timeout.
		const answering = pane ? resolvePaneSpec(Array.from(panes.values()), pane) : primaryPane();
		if (!answering) {
			return res.status(503).json(noBrowserBody("Moving the camera"));
		}

		const requestId = mintId(pendingViewports);

		const viewportPromise = new Promise<{ success: boolean; message: string }>(
			(resolve, reject) => {
				const timeout = setTimeout(() => {
					pendingViewports.delete(requestId);
					reject(new Error("Viewport request timed out after 10 seconds"));
				}, 10000);

				pendingViewports.set(requestId, { resolve, reject, timeout });
			},
		);

		// Addressed to one pane, about the board that pane holds: a
		// scroll-to-element only means anything on the board holding the element.
		sendToPane(
			answering.clientId,
			{
				type: "set_viewport",
				requestId,
				scrollToContent,
				scrollToElementIds,
				scrollToElementId,
				viewportZoomFactor,
				zoom,
				offsetX,
				offsetY,
			},
			paneBoards.get(answering.clientId) ?? answering.board,
		);

		viewportPromise
			.then((result) => {
				return res.json(result);
			})
			.catch((error) => {
				res.status(500).json({
					success: false,
					error: (error as Error).message,
				});
			});
	} catch (error) {
		logger.error("Error initiating viewport change:", error);
		// A pane spec that names nothing is a client error, and boardErrorStatus
		// is where that judgement already lives.
		res.status(error instanceof z.ZodError ? 400 : boardErrorStatus(error)).json({
			success: false,
			error:
				error instanceof z.ZodError
					? error.issues.map((issue) => issue.message).join("; ")
					: (error as Error).message,
		});
	}
});

// Viewport control: result (Frontend -> Express -> CLI)
app.post("/api/viewport/result", (req: Request, res: Response) => {
	try {
		const { requestId, success, message, error } = req.body;

		if (!requestId) {
			return res.status(400).json({
				success: false,
				error: "requestId is required",
			});
		}

		const pending = pendingViewports.get(requestId);
		if (!pending) {
			return res.json({ success: true });
		}

		if (error || success === false) {
			clearTimeout(pending.timeout);
			pendingViewports.delete(requestId);
			pending.reject(new Error(error || message || "Viewport update failed"));
			return res.json({ success: true });
		}

		clearTimeout(pending.timeout);
		pendingViewports.delete(requestId);
		pending.resolve({ success: true, message: message || "Viewport updated" });

		res.json({ success: true });
	} catch (error) {
		logger.error("Error processing viewport result:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Snapshots: save
app.post("/api/snapshots", (req: Request, res: Response) => {
	try {
		const { name } = req.body;

		if (!name || typeof name !== "string") {
			return res.status(400).json({
				success: false,
				error: "Snapshot name is required",
			});
		}

		const { key: boardKeyForRequest, content } = boardFromRequest(req, "Saving a snapshot");
		// A copy, deeply. A snapshot is the thing you go back to, so it must not
		// be the same objects as the board it is protecting you from (TASK-048).
		const snapshot: Snapshot = {
			name,
			board: boardKeyForRequest,
			elements: copyElements(
				stripBindingPresentationLinks(content.elements.values(), { boardKey: boardKeyForRequest }),
			),
			createdAt: new Date().toISOString(),
		};

		snapshots.set(name, snapshot);
		logger.info(
			`Snapshot saved: "${name}" with ${snapshot.elements.length} elements from board "${boardKeyForRequest}"`,
		);

		res.json({
			success: true,
			name,
			board: boardKeyForRequest,
			elementCount: snapshot.elements.length,
			createdAt: snapshot.createdAt,
		});
	} catch (error) {
		answerBoardError(res, error, "Error saving snapshot:");
	}
});

// Snapshots: list
app.get("/api/snapshots", (req: Request, res: Response) => {
	try {
		const list = Array.from(snapshots.values()).map((s) => ({
			name: s.name,
			board: s.board,
			elementCount: s.elements.length,
			createdAt: s.createdAt,
		}));

		res.json({
			success: true,
			snapshots: list,
			count: list.length,
		});
	} catch (error) {
		logger.error("Error listing snapshots:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// Snapshots: get by name
app.get("/api/snapshots/:name", (req: Request, res: Response) => {
	try {
		const { name } = req.params;
		if (typeof name !== "string" || !name) {
			return res.status(400).json({ success: false, error: "Snapshot name is required" });
		}
		const snapshot = snapshots.get(name);

		if (!snapshot) {
			return res.status(404).json({
				success: false,
				error: `Snapshot "${name}" not found`,
			});
		}

		res.json({
			success: true,
			snapshot: {
				...snapshot,
				elements: presentElements(snapshot.elements, {
					boardKey: snapshot.board,
					checkoutSnapshot: checkoutSnapshotFor(res),
				}),
			},
		});
	} catch (error) {
		logger.error("Error fetching snapshot:", error);
		res.status(500).json({
			success: false,
			error: (error as Error).message,
		});
	}
});

// ─── Boards ───────────────────────────────────────────────────
//
// A board is a named diagram persisted as one .excalidraw.md note in the vault
// (ADR 0004). A pane holds exactly one at a time, so these routes are how a
// pane's board gets swapped: open reads a note into the store and points ONE
// pane at it, save writes the store back out. Nothing here has an opinion
// about what any other pane is showing.
//
// WRITES ARE CHECKED, NOT LOCKED (ADR 0006). archboard records the sha-256 of a
// note's bytes when it reads it, and verifies that hash against the destination
// before it writes. If the two differ, the file changed underneath — Obsidian,
// a sync client, another editor — and the save is refused with nothing written,
// because an Excalidraw scene cannot be merged and overwriting would delete
// work nobody was told about. Deliberately not locking and deliberately not
// reloading: two writers can still both hold the board, and the human picks
// which copy survives.

const BoardAddressSchema = z.object({
	board: z.string().min(1),
	variant: z.string().optional(),
	level: z.string().optional(),
});

// A board address as callers write it: "payments", "payments@proposed", or a
// name plus an explicit variant. The key form is what a human says and what
// `board list` prints, so it is accepted everywhere a board is named.
function identityFromParams(params: {
	board: string;
	variant?: string;
	level?: string;
}): BoardIdentity {
	const base = params.variant
		? makeIdentity({ board: params.board, variant: params.variant })
		: parseBoardKey(params.board);
	return { ...base, ...(params.level ? { level: validateLevel(params.level) } : {}) };
}

// `content` is passed by callers that have already read the note, which is
// every route that answers about a board it just touched; the default is for
// the ones that have not.
function identityResponse(key: string, board: BoardState, content?: BoardContent) {
	const read = content ?? readBoardContent(board);
	return {
		board: key,
		identity: board.identity,
		elementCount: read.elements.size,
		// Which edit of the board this is, so a writer can state a precondition on
		// its first write rather than having to make one to find out (TASK-091).
		// Null for a note archboard has not written yet, and for one whose own
		// `version` key holds something that is not a count.
		version: read.version ?? null,
		// Scratch has a note like every other board; what it has not got is a name
		// anybody chose. See boardSummaries().
		placeholder: key === SCRATCH_KEY,
		...(board.file ? { file: board.file } : {}),
		...(board.savedAt ? { savedAt: board.savedAt } : {}),
		...(board.loadedAt ? { loadedAt: board.loadedAt } : {}),
	};
}

/**
 * Point one pane at a board.
 *
 * The message goes to that pane's socket alone. Broadcasting it — which is
 * what this did while the server held one board — is the same thing as
 * declaring that every pane shows the same board, because `board_switched`
 * replaces the receiving pane's whole scene.
 *
 * `pane` is null when nothing is on screen: the board still becomes the
 * server's active one, which is what a later pane will adopt and what an
 * unqualified caller means while there is no pane to disagree.
 */
function switchPaneTo(
	pane: PaneRegistration | null,
	key: string,
	known?: BoardContent,
	checkoutSnapshot: CheckoutSnapshot = EMPTY_CHECKOUT_SNAPSHOT,
): BoardState {
	const board = boards.get(key);
	if (!board) throw new Error(`Board "${key}" is not open`);
	// One read, for the two things that need the board: the feed's new baseline
	// and the scene the pane receives. Callers that have just read the note pass
	// it in rather than making this read it again.
	const content = known ?? readBoardContent(board);
	// A board arriving wholesale is not a change anybody made, so the feed takes
	// the new state as its baseline rather than reporting several hundred
	// additions and burying the first real edit under them. Only when the board
	// was not already on screen somewhere: another pane may be part way through
	// an edit on it, and resetting would swallow that.
	const alreadyShown = boardsOnScreen().some(
		(shown) => shown.board === key && shown.paneId !== pane?.paneId,
	);
	if (!alreadyShown) {
		changeFeed.reset(key, board.identity, () => boardElements(board));
	}

	if (!pane) return board;
	paneBoards.set(pane.clientId, key);

	// The selection belonged to the board that pane was showing and means
	// nothing on this one. Only that pane's: the other pane is still looking at
	// whatever it had picked.
	selectionState.byClient.delete(pane.clientId);
	if (selectionState.current?.clientId === pane.clientId) {
		selectionState.current = null;
		broadcastSelection();
	}

	sendToPane(
		pane.clientId,
		{
			type: "board_switched",
			identity: board.identity,
			elements: presentElements(content.elements.values(), {
				boardKey: key,
				checkoutSnapshot,
			}),
			...boardFilesMessage(content),
			timestamp: new Date().toISOString(),
		},
		key,
	);
	// Where the new board's lock stands, straight after the board itself. A pane
	// arriving on a board somebody else is writing has to know before the next
	// touch, not after the write it is about to make has been refused (ADR 0016).
	tellPaneAboutLock(pane.clientId, key);
	return board;
}

/**
 * The pane a board request is addressed to.
 *
 * A named pane is taken literally. An unnamed one is only allowed where it
 * cannot be wrong: one pane on screen means that pane, no pane on screen means
 * the board is loaded without being shown, and two panes means say which
 * (src/runtime/engine/panes.ts). The response always names where the board landed.
 */
function paneFromRequest(spec: unknown): PaneRegistration | null {
	const registrations = Array.from(panes.values());
	if (typeof spec === "string" && spec.trim()) return resolvePaneSpec(registrations, spec);
	return soloPane(registrations);
}

/**
 * The pane that answers a request addressed to "the browser" and to no board.
 *
 * Image export and viewport control name a pane or take this one, and neither
 * of them names a board: a picture is of whatever is on that half of the
 * screen. So there is nothing here to resolve a board against, and nothing
 * that could resolve to the wrong one — the caller either says which pane or
 * gets the first.
 *
 * An operation that *does* name a board must not come through here. Use
 * `paneShowing`: the board it was given already settles which pane, so taking
 * the first one instead would answer a different question than the one asked.
 */
function primaryPane(): PaneRegistration | null {
	const registrations = Array.from(panes.values());
	return registrations.find((pane) => pane.primary) ?? registrations[0] ?? null;
}

/** One pane, named the way a human would point at it: "the left pane". */
function paneRef(pane: PaneRegistration): Record<string, unknown> {
	const entry = panesInOrder(Array.from(panes.values())).find(
		(p) => p.pane.clientId === pane.clientId,
	);
	return {
		paneId: pane.paneId,
		clientId: pane.clientId,
		place: entry?.place ?? "the only pane",
		position: entry?.position ?? 1,
	};
}

/** Where a board landed, for the caller who did not say. */
function paneResponse(pane: PaneRegistration | null): Record<string, unknown> {
	return { pane: pane ? paneRef(pane) : null };
}

// What exists: every board in the vault, plus the ones open in this process.
//
// With ?repo=<identity>, the answer is narrowed to the boards that describe
// that repository: the ones with nodes bound to it, each listing which nodes
// matched (TASK-030). The identity is resolved by the caller, never here, for
// the same reason bindings are (ADR 0011) — this process's working directory is
// nobody's.
app.get("/api/boards", (req: Request, res: Response) => {
	try {
		const vault = requireVaultRoot();
		const repo = typeof req.query.repo === "string" ? req.query.repo.trim() : "";
		if (repo) {
			const open = Array.from(boards.entries()).map(([key, board]) =>
				Object.assign(
					{
						key,
						identity: board.identity,
						elements: boardElements(board),
					},
					board.file ? { file: board.file } : {},
				),
			);
			const found = boardsForRepo(repo, open, vault);
			return res.json({
				success: true,
				vault,
				repo,
				boards: found.boards,
				scanned: found.scanned,
				...(found.unreadable.length ? { unreadable: found.unreadable } : {}),
				open: openBoards(),
				onScreen: boardsOnScreen(),
			});
		}
		res.json({
			success: true,
			vault,
			boards: listBoards(vault),
			open: openBoards(),
			onScreen: boardsOnScreen(),
		});
	} catch (error) {
		answerBoardError(res, error, "Error listing boards:");
	}
});

// One noninteractive board preview, resolved directly from its note.
app.get("/api/boards/preview", (req: Request, res: Response) => {
	let key = "";
	try {
		const asked = boardOfRequest(req);
		if (!asked) {
			return res.status(400).json({
				success: false,
				error: "Previewing a board needs ?board=<board>.",
			});
		}
		key = boardKey(parseBoardKey(asked));
		const { board, content } = resolveBoard(key, "Previewing a board");
		return res.json({
			success: true,
			board: key,
			fingerprint: hashBoardBytes(renderContent(board.identity, content).bytes),
			elements: copyElements(
				stripBindingPresentationLinks(content.elements.values(), { boardKey: key }),
			),
			files: boardFilesMessage(content).files ?? {},
		});
	} catch (error) {
		return answerBoardError(res, error, key ? `Preview unavailable for board "${key}"` : undefined);
	}
});

// One board's identity and save state. Named, like everything else: there is
// no "the board the canvas is holding" to ask about any more — a pane asks
// about its own, and `panes` says what each pane holds.
app.get("/api/boards/info", (req: Request, res: Response) => {
	try {
		const { key, board, content } = boardFromRequest(req, "board info");
		res.json({ success: true, ...identityResponse(key, board, content) });
	} catch (error) {
		answerBoardError(res, error);
	}
});

// Open a board from the vault onto the canvas.
app.post("/api/boards/open", (req: Request, res: Response) => {
	try {
		const params = BoardAddressSchema.extend({
			reload: z.boolean().optional(),
			pane: z.string().optional(),
		}).parse(req.body ?? {});
		const asked = identityFromParams(params);
		const key = boardKey(asked);
		const prepared = res.locals.preparedBoardOpen as PreparedBoardOpen | undefined;
		const alreadyRegistered = boards.has(key) && !params.reload;
		const { board, content } =
			prepared?.key === key && !alreadyRegistered
				? materializeResolvedBoard(prepared.resolution)
				: resolveInstalledBoard(key, "Opening a board");
		if (asked.level) board.identity = { ...board.identity, level: asked.level };
		const pane = paneFromRequest(params.pane);
		// The bytes just read are what the panes are about to be shown, so they are
		// the baseline the next write is checked against.
		if (!board.file || !content.hash) throw new Error(`Board "${key}" has no persisted note.`);
		recordBaseline(board, board.file, content.hash, content.version ?? null);
		board.loadedAt = new Date().toISOString();
		// ADR 0006's first outcome: take the note, discard the canvas. It is the
		// one outcome that ends a hold by throwing the held copy away, so this is
		// the moment everything drawn since the board stopped saving is gone
		// (TASK-079). It costs what the human was told it costs.
		const ended = params.reload ? releaseBoardHold(key, "reload") : null;
		switchPaneTo(pane, key, content, checkoutSnapshotFor(res));
		// On a reload, every pane holding it — not only the one this was addressed
		// to. The others are showing the copy that was just discarded, and a pane
		// left showing it would report the discarded work straight back as a fresh
		// edit, which is the reload undone by the next user edit.
		if (params.reload) {
			for (const other of panes.values()) {
				if (other.clientId === pane?.clientId) continue;
				if ((paneBoards.get(other.clientId) ?? other.board) !== key) continue;
				switchPaneTo(other, key, content, checkoutSnapshotFor(res));
			}
		}

		logger.info(
			`Board opened: "${key}" (${content.elements.size} elements) from ${board.file}` +
				(pane ? ` into pane ${pane.paneId}` : " (no pane open)") +
				(ended ? `, discarding ${ended.writes} change(s) held since it stopped saving` : ""),
		);
		res.json({
			success: true,
			...identityResponse(key, board, content),
			source: alreadyRegistered ? "memory" : "vault",
			...paneResponse(pane),
		});
	} catch (error) {
		answerBoardError(res, error, "Error opening board:");
	}
});

const BoardNewAddressSchema = BoardAddressSchema.strict();

// Start a new, empty board by atomically publishing its canonical note.
app.post("/api/boards/new", (req: Request, res: Response) => {
	try {
		const params = BoardNewAddressSchema.parse(req.body ?? {});
		const identity = identityFromParams(params);
		const key = boardKey(identity);
		const holder = holderFromRequest(req, key);
		void trackMutationWork(req, `${req.method} ${req.path} board-create wait`, (signal) =>
			withBoardLock({ board: key, holder, signal }, () => createBoard(identity)),
		)
			.then(({ key: createdKey, board, content }) => {
				logger.info(`Board created: "${createdKey}" as ${board.file}`);
				return res.json({
					success: true,
					...identityResponse(createdKey, board, content),
					created: true,
					saved: true,
				});
			})
			.catch((error) => {
				if (error instanceof BoardLockCancelledError && (req.aborted || res.destroyed)) return;
				answerBoardError(res, error, "Error creating board:");
			});
	} catch (error) {
		answerBoardError(res, error, "Error creating board:");
	}
});

// Write a board to the vault. With no address it saves the board the canvas is
// holding under its own identity; with one it saves as that board instead
// (which is also how the scratch board gets a name).
app.post("/api/boards/save", (req: Request, res: Response) => {
	try {
		const body = req.body ?? {};
		const source = boardTargetFromRequest(req, "Saving a board");
		const sourceBoard = source.board;
		// The human's "overwrite it anyway" — one of the three outcomes a conflict
		// offers. Never set by archboard on its own behalf.
		const force = body.force === true;

		// With a name, this is a save-as; without one, the board keeps its own
		// identity and only the fields actually passed are changed.
		//
		// Either way the level comes across unless the caller states another one.
		// A branch is the same subject at the same abstraction tier, and level is
		// board identity from a vocabulary the project grew on purpose, so
		// `--as payments@option-a` must not quietly produce a proposal at no level
		// while the board it came from sits at system (TASK-039). `--variant`
		// always did this, by keeping the source's identity; `--as` built a fresh
		// one and dropped it.
		const level = body.level ?? sourceBoard.identity.level;
		const targetIdentity: BoardIdentity = body.name
			? identityFromParams({ board: String(body.name), variant: body.variant, level })
			: {
					...sourceBoard.identity,
					...(body.variant ? { variant: validateVariant(String(body.variant)) } : {}),
					...(level ? { level: validateLevel(String(level)) } : {}),
				};

		const file = vaultPathFor(targetIdentity);
		const targetKey = boardKey(targetIdentity);
		// Saving under another address is branching, and the branch is a board of
		// its own variant, so every node on it is restamped to say so. Without
		// that, `save --as payments@option-a` leaves twelve nodes claiming
		// "current" and compare reports the whole board changed (TASK-035). A
		// plain save is deliberately left alone: a node that records a foreign
		// variant on a board nobody branched really was copied in, and that is
		// what `variantAnomaly` is for.
		const kind = classifyBoardSave(source.key, targetKey);
		// Both senses of "wrote somewhere else": naming scratch and branching a
		// board that has a home. They differ over panes, not over elements.
		const branched = kind !== "same-board";
		// Who was looking at the board that was saved. Whether they move depends
		// on what the save was: giving the scratch board a name renames the thing
		// in front of them, branching writes a second board and leaves the first
		// one alone (ADR 0012).
		const watching = Array.from(panes.values()).filter(
			(pane) => (paneBoards.get(pane.clientId) ?? pane.board) === source.key,
		);
		const { board: savedBoard } = getOrCreateBoard(targetIdentity);
		savedBoard.file = file;
		const target: BoardWriteTarget = { key: targetKey, board: savedBoard };
		const heldSource = holdOn(source.key);
		const moved = panesFollowSave(kind) || (heldSource && branched) ? watching : [];

		answerBoardWrite(res, {
			source,
			origin: "agent",
			// Save is the explicit resolution for a held board. It writes the note
			// chosen by the person instead of adding another change to the held copy.
			save: { target, force },
			mutation: (content, destinationBefore) => {
				const saved = branched
					? restampVariant(Array.from(content.elements.values()), targetIdentity.variant)
					: Array.from(content.elements.values());
				content.elements = new Map(saved.map((element) => [element.id, element]));
				const savedIds = new Set(saved.map((element) => element.id));
				return {
					value: null,
					...(kind === "same-board"
						? {}
						: {
								delta: {
									created: saved.filter((element) => !destinationBefore.elements.has(element.id)),
									updated: saved.filter((element) => destinationBefore.elements.has(element.id)),
									deleted: Array.from(destinationBefore.elements.keys()).filter(
										(id) => !savedIds.has(id),
									),
								},
							}),
				};
			},
			afterPersist: ({ content, written }) => {
				for (const pane of moved) switchPaneTo(pane, targetKey, content, checkoutSnapshotFor(res));
				logger.info(
					`Board saved: "${targetKey}" (${written?.elementCount ?? content.elements.size} elements) -> ${file}` +
						(kind === "same-board" ? "" : ` [${kind}]`) +
						(moved.length ? `, panes moved: ${moved.map((pane) => pane.paneId).join(", ")}` : ""),
				);
			},
			answer: ({ content, written }) => {
				if (!written) throw new Error(`Saving "${targetKey}" did not write its note.`);
				return {
					success: true,
					...identityResponse(targetKey, savedBoard, content),
					file,
					elements: written.elementCount,
					overwrote: written.overwrote,
					...(force && written.overwrote ? { forced: true } : {}),
					saveKind: kind,
					savedFrom: source.key,
					...(heldSource
						? {
								resolvedHold: {
									board: source.key,
									outcome: branched ? "elsewhere" : "overwrite",
									writes: heldSource.writes,
									since: heldSource.since,
								},
							}
						: {}),
					panes: {
						moved: moved.map(paneRef),
						kept: (moved.length === 0 && kind === "branch" ? watching : []).map(paneRef),
						onScreen: boardsOnScreen(),
					},
				};
			},
		});
	} catch (error) {
		answerBoardError(res, error, "Error saving board:");
	}
});

// ─── Compare ──────────────────────────────────────────────────
//
// A structured semantic diff between two variants, joined on node identity
// (src/runtime/engine/compare.ts). Read-only in the strictest sense: comparing two boards
// must never disturb the one on screen, so this neither opens a board, nor
// registers one in the store, nor records a baseline, nor moves the active
// pointer. Both sides are read off disk, because that is where a board is
// (ADR 0015); what `source` still distinguishes is whether the side is a board
// this canvas has open — and therefore possibly on a pane in front of somebody
// — or one that only exists in the vault. Reported per side, because they can
// differ and the human needs to know which they were told about.

function loadSideForCompare(key: string): CompareSideInput {
	const registered = boards.has(key);
	const resolved = resolveBoard(key, "Comparing boards");
	return {
		key,
		identity: resolved.board.identity,
		elements: Array.from(resolved.content.elements.values()).filter(
			(element) => !element.isDeleted,
		),
		source: registered ? "memory" : "vault",
		file: resolved.board.file,
		onScreen: boardsOnScreen().some((shown) => shown.board === key),
	};
}

// Every address that exists for a board name — in the vault and in this
// session — so a one-sided `compare payments` can find the other side and, when
// it cannot, say what there was to choose from.
function addressesFor(boardName: string): string[] {
	const keys = new Set<string>();
	try {
		for (const found of listBoards()) {
			if (found.identity.board === boardName) keys.add(found.key);
		}
	} catch {
		/* no vault: the open boards are still an answer */
	}
	for (const [key, state] of boards) {
		if (state.identity.board === boardName) keys.add(key);
	}
	return [...keys].toSorted();
}

app.get("/api/boards/compare", (req: Request, res: Response) => {
	try {
		const fromParam = typeof req.query.from === "string" ? req.query.from.trim() : "";
		if (!fromParam) {
			return res
				.status(400)
				.json({ success: false, error: "compare needs at least one board: ?from=payments" });
		}
		const fromIdentity = parseBoardKey(fromParam);
		let fromKey = boardKey(fromIdentity);
		let toKey =
			typeof req.query.to === "string" && req.query.to.trim()
				? boardKey(parseBoardKey(req.query.to.trim()))
				: "";

		// One address given: find the other side among that board's variants.
		// `current` is privileged, so whenever it exists it is the `from` side —
		// the diff reads "what the proposal changes about the architecture that
		// exists", never the reverse.
		if (!toKey) {
			const siblings = addressesFor(fromIdentity.board).filter((k) => k !== fromKey);
			if (siblings.length === 0) {
				return res.status(400).json({
					success: false,
					error:
						`"${fromKey}" has no other variant to compare against. A variant is a separate note ` +
						`(${fromIdentity.board}@option-a.excalidraw.md); author one with ` +
						`\`board new ${fromIdentity.board}@option-a\`, or name both sides: ` +
						"`compare <from> <to>`.",
				});
			}
			if (siblings.length > 1) {
				return res.status(400).json({
					success: false,
					error:
						`"${fromIdentity.board}" has ${siblings.length} variants — ${siblings.join(", ")} — so which ` +
						"two to compare is not obvious. Name both sides: `compare <from> <to>`.",
					variants: [fromKey, ...siblings].toSorted(),
				});
			}
			const other = siblings[0]!;
			if (fromIdentity.variant === CURRENT_VARIANT) {
				toKey = other;
			} else {
				// The given side is a proposal and the only other one is what it is a
				// proposal against, so it reads current -> proposal.
				toKey = fromKey;
				fromKey = other;
			}
		}

		if (fromKey === toKey) {
			return res.status(400).json({
				success: false,
				error: `Both sides name the same board ("${fromKey}"), so there is nothing to compare.`,
			});
		}

		const from = loadSideForCompare(fromKey);
		const to = loadSideForCompare(toKey);

		const result = compareBoards(from, to);
		if (from.identity.board !== to.identity.board) {
			result.warnings.unshift(
				`"${fromKey}" and "${toKey}" are different boards, not two variants of one. They still compare — ` +
					"node ids are the join key either way — but node ids are only guaranteed unique per board, so a " +
					"match here may be coincidence rather than the same architectural unit.",
			);
		}
		logger.info(
			`Compared "${fromKey}" (${from.source}) against "${toKey}" (${to.source}): ` +
				`+${result.summary.nodesAdded} -${result.summary.nodesRemoved} ~${result.summary.nodesChanged} nodes`,
		);
		res.json(result);
	} catch (error) {
		answerBoardError(res, error, "Error comparing boards:");
	}
});

// ─── The library ──────────────────────────────────────────────
//
// The stencil palette, which is not a board and never becomes one. These two
// routes are the whole of it: the browser reads the library when it mounts and
// writes back whatever Excalidraw says the library now is. Nothing here goes
// near an element store or the change feed — a stencil only becomes elements
// when a human drags it onto a canvas, and by then it has arrived through the
// ordinary change-report path like anything else they drew.

app.get("/api/library", (_req: Request, res: Response) => {
	try {
		const state = readLibrary();
		res.json({
			success: true,
			items: state.items,
			seeded: state.seeded,
			origins: state.origins,
			file: state.file,
			vaultBacked: state.vaultBacked,
		});
	} catch (error) {
		logger.error("Error reading library:", error);
		res.status(500).json({ success: false, error: (error as Error).message });
	}
});

// Replace the library. The browser sends the whole set because that is what
// Excalidraw provides it — there is no library delta to be had — and last write
// wins, which is honest for a palette two tabs are unlikely to edit at once.
// The result is broadcast so the other tabs stop being the stale one.
app.put("/api/library", (req: Request, res: Response) => {
	try {
		const body = z
			.object({
				items: z.array(
					z.looseObject({
						id: z.string(),
						status: z.enum(["published", "unpublished"]).optional(),
						elements: z.array(z.any()),
						created: z.number().optional(),
						name: z.string().optional(),
					}),
				),
			})
			.parse(req.body ?? {});

		const items: LibraryItem[] = body.items.map((item) =>
			Object.assign(
				{
					id: item.id,
					status: item.status ?? "published",
					elements: item.elements,
					created: item.created ?? Date.now(),
				},
				item.name ? { name: item.name } : {},
			),
		);

		const state = writeLibrary(items);
		// Including the tab that sent it. It recognises its own write by content
		// rather than by a client id, so there is no echo to suppress here.
		broadcastBoardless({
			type: "library_changed",
			items: state.items,
			timestamp: new Date().toISOString(),
		});
		res.json({
			success: true,
			count: state.items.length,
			file: state.file,
			vaultBacked: state.vaultBacked,
		});
	} catch (error) {
		logger.error("Error writing library:", error);
		res
			.status(error instanceof z.ZodError ? 400 : 500)
			.json({ success: false, error: (error as Error).message });
	}
});

// Serve the frontend
app.get("/", (req: Request, res: Response) => {
	const htmlFile = path.join(moduleDir, "../dist/frontend/index.html");
	res.sendFile(htmlFile, (err) => {
		if (err) {
			logger.error("Error serving frontend:", err);
			res.status(404).send('Frontend not found. Please run "bun run build" first.');
		}
	});
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		boards_open: boards.size,
		elements_count: Array.from(boards.values()).reduce(
			(total, b) => total + boardElementCount(b),
			0,
		),
		websocket_clients: clients.size,
		// Identity for `stop`: it must only ever signal a process that both
		// identifies as this service AND self-reports its pid — never a pid
		// from a stale pidfile or an unrelated app squatting on the port.
		service: "mcp-excalidraw-canvas",
		pid: process.pid,
		application: {
			phase: canvasLifetime?.phase() ?? "idle",
			acceptingWrites: mutationAdmission.accepting(),
			activeWrites: mutationAdmission.active(),
			activeMutations: mutationAdmission.activeMutations().map((entry) => ({
				name: entry.name,
				kind: entry.kind,
				activeMs: Math.max(0, Date.now() - entry.startedAt),
			})),
		},
		renderer: boardRenderer.status(),
		held_boards: heldBoardKeys().map((board) => reportHold(board, holdOn(board)!)),
		// Whether this process is running the source that is on disk now, and
		// which build the frontend has been rebuilt to. A long-lived process has no
		// symptom of its own for either, so it has to be asked (TASK-056).
		source: sourceState(),
		frontendBuild: frontendState(null).current,
	});
});

// Sync status endpoint
app.get("/api/sync/status", (req: Request, res: Response) => {
	res.json({
		success: true,
		boards: boardSummaries(boardElementCount).map((b) => ({
			board: b.key,
			elementCount: b.elementCount,
		})),
		timestamp: new Date().toISOString(),
		memoryUsage: {
			heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
			heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
		},
		websocketClients: clients.size,
	});
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
	logger.error("Unhandled error:", err);
	if (res.headersSent || res.destroyed) return;
	res.status(500).json({
		success: false,
		error: "Internal server error",
	});
});

// Start server
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const LOOPBACK_GUARD_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "::"]);
const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"];

function formatHostForUrl(host: string): string {
	return host.includes(":") ? `[${host}]` : host;
}

function canConnect(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const socket = net.createConnection({ host, port });

		const finish = (isOpen: boolean): void => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(isOpen);
		};

		socket.setTimeout(250);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

async function findExistingLoopbackListener(port: number): Promise<string | null> {
	for (const host of LOOPBACK_ADDRESSES) {
		if (await canConnect(host, port)) {
			return host;
		}
	}
	return null;
}

function logHttpServerError(error: NodeJS.ErrnoException): void {
	if (error.code === "EADDRINUSE") {
		const address = (error as NodeJS.ErrnoException & { address?: string }).address || HOST;
		logger.error(`Canvas server port ${PORT} is already in use on ${formatHostForUrl(address)}.`);
	} else if (error.code === "EACCES") {
		logger.error(`Canvas server cannot bind ${formatHostForUrl(HOST)}:${PORT}: permission denied.`);
	} else {
		logger.error("Canvas HTTP server failed:", error);
	}
}

function isRecoverableCanvasStopError(error: unknown): boolean {
	return error instanceof CanvasApplicationHeldError || error instanceof CanvasApplicationBusyError;
}

function reportCanvasStopError(error: unknown): void {
	const message = `Canvas shutdown refused or failed: ${(error as Error).message}`;
	if (isRecoverableCanvasStopError(error)) logger.error(message);
	else {
		process.stderr.write(message + "\n");
		process.exitCode = 1;
	}
}

/**
 * Take the scratch board's note, if there is one.
 *
 * Scratch is where a first run draws, and it used to be the one board that
 * lived in the process and nowhere else, so quitting the canvas threw it away
 * without saying so. It has a note now like every other board (ADR 0015),
 * `<vault>/.archboard/scratch.excalidraw.md`, and this is where the canvas
 * picks it back up.
 *
 * Nothing is written here. A vault that has never held a scratch note gets one
 * when the board is first saved, which is how `board new` behaves too.
 */
function adoptScratchBoard(): void {
	const identity = makeIdentity({ board: SCRATCH_BOARD });
	const { board } = getOrCreateBoard(identity);
	let loaded: LoadedBoard | null = null;
	let unreadable = false;
	try {
		loaded = readBoardFile(identity);
	} catch (error) {
		unreadable = true;
		// A scratch note we cannot read is not worth refusing to start over: it is
		// a scratch pad, the vault holds the boards that matter, and the file is
		// left alone rather than replaced.
		logger.warn(`Scratch note ignored: ${(error as Error).message}`);
	}
	if (unreadable) {
		board.file = vaultPathFor(identity);
		return;
	}
	if (!loaded) {
		createBoard(identity);
		return;
	}
	board.file = loaded.file;

	// The bytes just read are the baseline the first write is checked against.
	// Nothing is ingested: the note is the board, and every request that touches
	// scratch will read it for itself.
	recordBaseline(board, loaded.file, loaded.hash, loaded.version);
	board.loadedAt = new Date().toISOString();
	try {
		const count = readBoardContent(board).elements.size;
		logger.info(
			`Scratch board picked up where it was left: ${count} element(s) from ${loaded.file}`,
		);
	} catch (error) {
		if (!(error instanceof RenderGeometryError || error instanceof NativeElementValidationError))
			throw error;
		logger.warn(
			`Scratch note cannot be rendered and was left unchanged: ${error.message} ` +
				"The canvas will start so the pane can show this error.",
		);
	}
}

function sleepFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function canonicalContextFromBrief(
	brief:
		| SettledSemanticChangeEvent
		| ReturnType<CodexWorkbenchComponents["semanticPublisher"]["freshBrief"]>,
	paneId: string,
	operation: ArchboardContext["operation"],
): ArchboardContext {
	if (brief.child.id === null || brief.child.epoch === null)
		throw new Error("Canonical Codex context requires the active child epoch.");
	return ArchboardContextSchema.parse({
		schema: 1,
		paneId,
		board: {
			note: brief.board.note,
			version: brief.version ?? 0,
			cursor: brief.cursor === null ? null : canonicalSemanticCursorToken(brief.cursor),
		},
		threadLink: brief.threadLink,
		child: { id: brief.child.id, epoch: brief.child.epoch },
		workhorse: brief.workhorse,
		coordinator: brief.coordinator,
		semantic: {
			brief: brief.brief,
			capturedAtMs: brief.freshness.capturedAtMs,
			freshUntilMs: brief.freshness.freshUntilMs,
			truncated: brief.truncated,
		},
		focus: {
			paneId: brief.pane.focused ? brief.pane.paneId : null,
			capturedAtMs: brief.freshness.capturedAtMs,
		},
		selection: { elementIds: brief.selection, capturedAtMs: brief.freshness.capturedAtMs },
		claim: brief.claim,
		ambiguity: brief.ambiguity,
		operation,
	});
}

function createCodexWorkbenchHost(): CanvasCodexWorkbenchHost {
	let active: CodexWorkbenchComponents | null = null;
	let installedIdentity: CodexWorkbenchComponents["identity"] | null = null;

	const semanticInput = (
		contextBoard: string,
		cursor: SemanticContextInput["cursor"],
		exactPaneId: string,
	): SemanticContextInput => {
		const pane =
			Array.from(panes.values()).find(
				(candidate) =>
					candidate.paneId === exactPaneId &&
					(paneBoards.get(candidate.clientId) ?? candidate.board) === contextBoard,
			) ?? null;
		if (pane === null)
			throw new Error(
				`The Codex context board has no authoritative browser pane: ${contextBoard}.`,
			);
		const paneId = pane.paneId;
		const board = boards.get(contextBoard);
		if (board === undefined)
			throw new Error(`The Codex context board is not open: ${contextBoard}.`);
		let description: string;
		let version: number | null;
		let stale = false;
		let staleReasons: readonly string[] = [];
		try {
			const content = readBoardContent(board);
			description = describeScene(Array.from(content.elements.values()));
			version = content.version ?? null;
		} catch (error) {
			description = `The board note could not be read: ${(error as Error).message}`;
			version = null;
			stale = true;
			staleReasons = ["board_note_unreadable"];
		}
		const linkBinding = active?.threadLink.read(paneId);
		const link = linkBinding?.link;
		const workhorse = active?.workhorse.snapshot();
		const coordinator = active?.coordinator.snapshot();
		const linkedThreadId = link?.state === "executable" ? link.threadId : null;
		const linkedCreatedWorkhorse =
			linkedThreadId !== null && workhorse?.threadId === linkedThreadId ? workhorse : null;
		const linkedCoordinator = linkedCreatedWorkhorse === null ? null : coordinator;
		const realtime = linkedCreatedWorkhorse === null ? null : active?.realtime.generation();
		const selection = pane ? selectionState.byClient.get(pane.clientId) : null;
		const holder = boardLockState(contextBoard);
		const doing = recentDoing(contextBoard).at(-1)?.doing ?? null;
		return {
			repository: path.resolve(moduleDir, ".."),
			child: {
				id:
					link?.state === "executable"
						? link.childId
						: (workhorse?.childId ?? coordinator?.childId ?? null),
				epoch:
					link?.state === "executable"
						? link.epoch
						: (workhorse?.epoch ?? coordinator?.epoch ?? null),
			},
			threadLink: {
				state: link?.state ?? "unbound",
				reason: link?.reason ?? null,
			},
			workhorse: {
				threadId: linkedThreadId,
				turnId: null,
			},
			coordinator: {
				threadId: linkedCoordinator?.threadId ?? null,
				realtimeSessionId: realtime?.wireSessionId ?? null,
			},
			board: {
				key: contextBoard,
				note: board.file ?? vaultPathFor(board.identity),
				version,
			},
			pane: { paneId, focused: pane?.focused ?? false },
			selection: selection?.elementIds ?? [],
			claim: { holder: holder?.kind ?? "none", doing: holder?.reason ?? doing },
			doing,
			cursor,
			description,
			ambiguity: [],
			stale,
			staleReasons,
		};
	};

	const currentSemanticPane = (contextBoard?: string): PaneRegistration => {
		const binding = active?.semanticDelivery.snapshot().binding ?? null;
		return requireExactSemanticPane({
			bindingPaneId: binding?.paneId ?? null,
			contextBoard,
			panes: panes.values(),
			boardForPane: (pane) => paneBoards.get(pane.clientId) ?? pane.board,
		});
	};

	const waitForTargets: CanvasCodexWorkbenchHost["waitForTargets"] = async (input) => {
		const workbench = active;
		if (workbench === null) throw new Error("The Codex workbench is not ready to observe targets.");
		const deadline = Date.now() + input.timeoutMs;
		do {
			if (input.signal.aborted)
				throw Object.assign(new Error("The dynamic wait was cancelled."), {
					code: "cancellation",
				});
			for (const threadId of input.owner.sortedTargetThreadIds) {
				const wireThreadId = workbench.identity.identity.decoder.serializeCodexIdentity(threadId);
				const pendingApproval = workbench.approvals.inspect().some((snapshot) => {
					const identity = snapshot.identity;
					const targetThreadId =
						identity.kind === "legacy" ? identity.conversationId : identity.threadId;
					return snapshot.state === "pending" && targetThreadId === threadId;
				});
				if (pendingApproval)
					return {
						event: "attention",
						threadId: wireThreadId,
						sequence: input.previousSequence + 1,
						cursor: input.cursor,
						targetOwned: true,
					};
				const result = await workbench.session.threadRead({ threadId, includeTurns: false });
				if (result.thread.status.type === "systemError")
					return {
						event: "attention",
						threadId: wireThreadId,
						sequence: input.previousSequence + 1,
						cursor: input.cursor,
					};
				if (result.thread.status.type === "idle")
					return {
						event: "completed",
						threadId: wireThreadId,
						sequence: input.previousSequence + 1,
						cursor: input.cursor,
					};
			}
			const remaining = deadline - Date.now();
			if (remaining > 0) await sleepFor(Math.min(remaining, CODEX_WAIT_TARGET_POLL_MS));
		} while (Date.now() < deadline);
		return {
			event: "timeout",
			threadId: null,
			sequence: input.previousSequence + 1,
			cursor: input.cursor,
		} satisfies DynamicWaitEvent;
	};

	const checkoutRoot = path.resolve(moduleDir, "..");
	return {
		checkoutRoot,
		onCodexProcessGroupOwned: (codexGroup) => {
			writeCanvasStartupProtocolRecord(
				canvasStartupOwnershipRecord({ canvasPid: process.pid, codexGroup }),
			);
		},
		semanticPublisher: {
			feed: changeFeed,
			feedId: changeFeed.status().feedId,
			fresh: {
				read: () => {
					const pane = currentSemanticPane();
					const key = paneBoards.get(pane.clientId) ?? pane.board;
					return semanticInput(key, null, pane.paneId);
				},
			},
			contextForChange: (event: SettledChangeSourceEvent) => {
				const pane = currentSemanticPane(event.board);
				return semanticInput(
					event.board,
					{ feedId: changeFeed.status().feedId, sequence: event.cursor },
					pane.paneId,
				);
			},
		},
		paneIds: () => panesInOrder(Array.from(panes.values())).map(({ pane }) => pane.paneId),
		contextForEvent: (event, paneId, operation) =>
			canonicalContextFromBrief(
				event,
				paneId,
				operation === undefined
					? { id: null, kind: null, rpc: null, outcome: null }
					: { ...operation, outcome: null },
			),
		contextForOperation: (authority, operation) => {
			if (active === null) throw new Error("The Codex workbench context is not ready.");
			const pane = Array.from(panes.values()).find(
				(candidate) => candidate.paneId === authority.paneId,
			);
			if (pane === undefined)
				throw new Error(`The Codex context pane is not open: ${authority.paneId}.`);
			const exactBoardKey = paneBoards.get(pane.clientId) ?? pane.board;
			const binding = active.threadLink.read(authority.paneId);
			if (
				binding.link.state !== "executable" ||
				binding.link.threadId !== authority.threadId ||
				binding.link.childId !== authority.childId ||
				binding.link.epoch !== authority.epoch ||
				(authority.linkRevision !== undefined && binding.revision !== authority.linkRevision)
			)
				throw new Error("The lease-bound Codex pane context changed before capture.");
			const exactInput = semanticInput(exactBoardKey, null, authority.paneId);
			return canonicalContextFromBrief(
				active.semanticPublisher.freshBriefFor(exactInput),
				authority.paneId,
				{
					...operation,
					outcome: null,
				},
			);
		},
		waitForTargets,
		browserLeaseLedger,
		installIdentityDecoders: (identity) => {
			installedIdentity = identity;
		},
		installLifecycleSignals: (components) => {
			if (installedIdentity !== components.identity)
				throw new Error("The installed identity decoders do not match the active graph.");
			active = components;
			return () => {
				if (active === components) active = null;
			};
		},
		installBrowserGateway: (gateway) => {
			const socketOwner = createCanvasCodexBrowserSocketOwner({
				gateway,
				paneForBrowser: (browserId) => panes.get(browserId)?.paneId ?? null,
			});
			const remove = (): void => {
				socketOwner.dispose();
				wiring.codex.handleBrowserMessage = null;
				wiring.codex.acceptBrowser = null;
				wiring.codex.closeBrowser = null;
				wiring.codex.drainBrowsers = null;
			};
			wiring.codex.handleBrowserMessage = (instance, browserId, input, send) =>
				socketOwner.handle(instance, browserId, input, { send });
			wiring.codex.acceptBrowser = socketOwner.accept;
			wiring.codex.closeBrowser = socketOwner.close;
			wiring.codex.drainBrowsers = socketOwner.drain;
			try {
				for (const [browserId, socket] of currentSocketsByClient) {
					const instance = codexSocketInstances.get(socket);
					if (instance !== undefined) socketOwner.accept(instance, browserId);
				}
			} catch (error) {
				remove();
				throw error;
			}
			return remove;
		},
		stopBrowser: (gateway) => gateway.dispose(),
		stopRealtime: async (realtime) => {
			const generation = realtime.generation();
			if (generation === null) return;
			await realtime.stop({
				sessionId: generation.browserSessionId,
				correlationId: generation.browserCorrelationId,
			});
		},
		stopQueue: async (queue) => {
			await queue.shutdown();
		},
		onFatal: (error) => logger.error("Fatal Codex workbench fault:", error),
	};
}

let codexApplication: ReturnType<typeof createCanvasCodexWorkbenchApplication> | null = null;

function resetCodexWorkbenchWiring(): void {
	wiring.codex.installed = false;
	wiring.codex.phase = "idle";
	wiring.codex.shutdown = null;
	wiring.codex.acceptBrowser = null;
	wiring.codex.closeBrowser = null;
	wiring.codex.drainBrowsers = null;
	wiring.codex.handleBrowserMessage = null;
}

async function stopCodexWorkbench(): Promise<void> {
	const application = codexApplication;
	if (application === null) {
		resetCodexWorkbenchWiring();
		return;
	}
	await application.shutdown();
	if (codexApplication === application) codexApplication = null;
	resetCodexWorkbenchWiring();
}

async function prepareCodexWorkbench(signal: AbortSignal): Promise<void> {
	const [applicationModule, productionModule] = await Promise.all([
		import("../codex-workbench-application.js"),
		import("../codex-workbench-production.js"),
	]);
	if (signal.aborted) throw new Error("Codex startup was canceled before installation.");
	const application = applicationModule.createCanvasCodexWorkbenchApplication({
		state: wiring.codex,
		module: productionModule,
		installation: () =>
			productionModule.createCanvasCodexWorkbenchInstallation(createCodexWorkbenchHost()),
	});
	codexApplication = application;
	const cancel = (): void => {
		void application.shutdown().catch(() => undefined);
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		const preparing = application.prepare();
		if (signal.aborted) cancel();
		await preparing;
	} finally {
		signal.removeEventListener("abort", cancel);
	}
}

let httpClosePromise: Promise<void> | null = null;
function closeHttpServer(): Promise<void> {
	if (httpClosePromise !== null) return httpClosePromise;
	if (!server.listening) return Promise.resolve();
	httpClosePromise = new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return httpClosePromise;
}

async function forceCloseHttpServer(): Promise<void> {
	server.closeAllConnections();
	await closeHttpServer();
}

function startWebSocketServer(): void {
	if (wss !== null) throw new Error("The WebSocket server is already installed.");
	const owner = new WebSocketServer({ server });
	owner.on("connection", (socket, request) => {
		acceptedSockets.add(socket);
		socket.once("close", () => acceptedSockets.delete(socket));
		void acceptWebSocketConnection(socket, request).catch((error) => {
			logger.error("WebSocket checkout presentation failed:", error);
			socket.terminate();
		});
	});
	wss = owner;
}

function closeWebSocketServer(): Promise<void> {
	const owner = wss;
	if (owner === null) return Promise.resolve();
	return new Promise((resolve, reject) => {
		owner.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			owner.removeAllListeners();
			if (wss === owner) wss = null;
			resolve();
		});
	});
}

async function closeBrowserOwners(): Promise<void> {
	const cleanupFailures: unknown[] = [];
	const retainedFailures = new Set<unknown>();
	const retainFailure = (error: unknown): void => {
		if (error instanceof AggregateError) {
			for (const nested of error.errors) retainFailure(nested);
			return;
		}
		if (retainedFailures.has(error)) return;
		retainedFailures.add(error);
		cleanupFailures.push(error);
	};
	for (const socket of acceptedSockets) socket.terminate();
	const closeBrowser = wiring.codex.closeBrowser;
	if (closeBrowser !== null) {
		const settled = await Promise.allSettled(
			Array.from(codexSocketInstances, ([socket, instance]) => {
				const browserId = clientIds.get(socket);
				return browserId ? closeBrowser(instance, browserId) : Promise.resolve();
			}),
		);
		for (const result of settled) if (result.status === "rejected") retainFailure(result.reason);
	}
	try {
		await wiring.codex.drainBrowsers?.();
	} catch (error) {
		retainFailure(error);
	}
	for (const pending of pendingPaneOpens) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("Canvas stopped before the pane opened."));
	}
	for (const pending of pendingPaneCloses) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("Canvas stopped before the pane closed."));
	}
	for (const pending of pendingBrowserCaptures.values()) {
		clearTimeout(pending.timeout);
		if (pending.collectionTimeout !== null) clearTimeout(pending.collectionTimeout);
		pending.reject(new Error("Canvas stopped before the browser capture completed."));
	}
	for (const pending of pendingViewports.values()) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("Canvas stopped before the viewport move completed."));
	}
	pendingPaneOpens.clear();
	pendingPaneCloses.clear();
	pendingBrowserCaptures.clear();
	pendingViewports.clear();
	acceptedSockets.clear();
	clients.clear();
	clientIds.clear();
	currentSocketsByClient.clear();
	latestSocketAcceptanceByClient.clear();
	codexSocketInstances.clear();
	panes.clear();
	paneBoards.clear();
	browserLeaseLedger.active = null;
	browserLeaseLedger.retired.clear();
	selectionState.current = null;
	selectionState.byClient.clear();
	if (cleanupFailures.length > 0) {
		const detail = cleanupFailures
			.map((error) => (error instanceof Error ? error.message : String(error)))
			.join("; ");
		throw new AggregateError(cleanupFailures, `Browser cleanup failed: ${detail}`);
	}
}

const cleanupProvenBeforeResourceAcquisition = (): boolean => true;

async function startServer(): Promise<void> {
	let cleanupProven = cleanupProvenBeforeResourceAcquisition;
	let terminalReported = false;
	const reportStartupTerminal = (message: string | null = null): void => {
		if (terminalReported) return;
		terminalReported = true;
		writeCanvasStartupProtocolRecord(
			canvasStartupTerminalRecord({
				canvasPid: process.pid,
				cleanupProven: cleanupProven(),
				message,
			}),
		);
	};
	// No vault, no canvas (ADR 0015). Every board is a note, so a canvas without
	// a vault has nowhere to put anything, and the failure it used to produce
	// came later and cost more: the canvas opened, somebody drew on it, and the
	// drawing turned out to have been nowhere all along.
	//
	// Straight to stderr as well as the log, because a first run is exactly the
	// run whose LOG_LEVEL nobody has set, and the whole value of this is that
	// the person who started it reads it.
	if (!ARCHBOARD_VAULT) {
		process.stderr.write(noVaultMessage() + "\n");
		logger.error("Refusing to start canvas server: no vault (ARCHBOARD_VAULT is unset).");
		reportStartupTerminal(noVaultMessage());
		throw new Error(noVaultMessage());
	}

	if (LOOPBACK_GUARD_HOSTS.has(HOST)) {
		const existingHost = await findExistingLoopbackListener(PORT);
		if (existingHost) {
			const message =
				`Refusing to start canvas server on ${formatHostForUrl(HOST)}:${PORT}: ` +
				`${formatHostForUrl(existingHost)}:${PORT} is already listening. ` +
				"This prevents duplicate IPv4/IPv6 canvas servers from splitting state.";
			logger.error(message);
			reportStartupTerminal(message);
			throw new Error(message);
		}
	}

	// Only the process that actually wrote the pidfile may remove it —
	// a concurrent-start loser exiting on EADDRINUSE must not delete the
	// winner's pidfile.
	let ownsPidFile = false;
	let lifetime!: ReturnType<typeof createCanvasApplicationLifetime>;
	let httpErrorListener: ((error: NodeJS.ErrnoException) => void) | null = null;
	let httpPhase: "idle" | "starting" | "running" | "failed" | "stopping" = "idle";
	let httpStartPromise: Promise<void> | null = null;
	let runtimeServerStop: Promise<void> | null = null;
	const stopCanvasAfterHttpError = async (): Promise<void> => {
		try {
			await lifetime.stop("server-error");
			process.exitCode = 1;
		} catch (error) {
			reportCanvasStopError(error);
		} finally {
			if (lifetime.phase() === "running") runtimeServerStop = null;
		}
	};
	const stopAfterServerError = (error: NodeJS.ErrnoException): void => {
		logHttpServerError(error);
		if (runtimeServerStop !== null) return;
		runtimeServerStop = stopCanvasAfterHttpError();
	};
	const stopCanvasAfterSignal = async (signal: NodeJS.Signals): Promise<void> => {
		try {
			await lifetime.stop(signal);
			if (process.exitCode === undefined) process.exitCode = 0;
		} catch (error) {
			reportCanvasStopError(error);
		} finally {
			reportStartupTerminal();
		}
	};
	const shutdown = (signal: NodeJS.Signals): void => {
		logger.info(`Received ${signal}, shutting down canvas server`);
		void stopCanvasAfterSignal(signal);
	};
	const onTerm = (): void => shutdown("SIGTERM");
	const onInterrupt = (): void => shutdown("SIGINT");
	const onExit = (): void => {
		if (ownsPidFile) removePidFile(PORT);
	};
	lifetime = createCanvasApplicationLifetime({
		heldBoards: heldBoardKeys,
		quiesce: async () => {
			quiesceCheckoutWork();
			await mutationAdmission.quiesce();
		},
		resume: () => {
			acceptingCheckoutWork = true;
			mutationAdmission.resume();
		},
		observe: ({ action, resource }) => {
			// The logger cannot report its own terminal transition after its
			// writable stream has ended.
			if (resource === null || resource === "logger-transports") return;
			if (action === "force") logger.warn(`Canvas lifetime forcing stop: ${resource}`);
			else logger.debug(`Canvas lifetime ${action}: ${resource}`);
		},
		resources: [
			{
				name: "logger-transports",
				stop: () => closeLogger(),
				forceStop: () => forceCloseLogger(),
			},
			{
				name: "process-signals",
				start: () => {
					process.on("SIGTERM", onTerm);
					process.on("SIGINT", onInterrupt);
					process.on("exit", onExit);
				},
				stop: () => {
					process.off("SIGTERM", onTerm);
					process.off("SIGINT", onInterrupt);
					process.off("exit", onExit);
				},
			},
			{
				name: "engine-state",
				start: () => adoptScratchBoard(),
				stop: () => {
					watchBoardLocks(null);
					onBoardLockChanged(null);
					onBoardSweep(null);
					forgetLockAnnouncements();
					onNoteWrittenElsewhere(null);
					forgetNoteWatch();
					changeFeed.dispose();
					forgetDoing();
					forgetRememberedVersions("");
					snapshots.clear();
					boards.clear();
					selectionState.current = null;
					selectionState.byClient.clear();
				},
			},
			{
				name: "codex-workbench",
				start: prepareCodexWorkbench,
				stop: stopCodexWorkbench,
				forceStop: stopCodexWorkbench,
			},
			{
				name: "board-renderer",
				start: () => boardRenderer.start(),
				stop: async () => {
					await boardRenderer.stop();
				},
				forceStop: async () => {
					await boardRenderer.forceStop();
				},
			},
			{
				name: "http-server",
				start: (signal) => {
					const cancellation = new Error("Canvas HTTP startup was canceled.");
					const listenController = new AbortController();
					httpStartPromise = new Promise<void>((resolve, reject) => {
						httpPhase = "starting";
						let settled = false;
						const cancelListen = (): void => listenController.abort(signal.reason);
						const onClose = (): void => {
							settleStart(
								signal.aborted
									? cancellation
									: new Error("Canvas HTTP server closed before startup completed."),
							);
						};
						const settleStart = (error?: Error): void => {
							if (settled) return;
							settled = true;
							signal.removeEventListener("abort", cancelListen);
							server.off("close", onClose);
							if (error) {
								httpPhase = "failed";
								reject(error);
							} else resolve();
						};
						httpErrorListener = (error) => {
							if (httpPhase === "starting") {
								logHttpServerError(error);
								settleStart(error);
							} else if (httpPhase === "running") stopAfterServerError(error);
						};
						server.on("error", httpErrorListener);
						server.once("close", onClose);
						signal.addEventListener("abort", cancelListen, { once: true });
						if (signal.aborted) {
							cancelListen();
							settleStart(cancellation);
							return;
						}
						try {
							server.listen({ port: PORT, host: HOST, signal: listenController.signal }, () => {
								if (settled || signal.aborted) return;
								httpPhase = "running";
								const hostForUrl = formatHostForUrl(HOST);
								logger.info(`POC server running on http://${hostForUrl}:${PORT}`);
								writePidFile(PORT, process.pid);
								ownsPidFile = true;
								settleStart();
							});
						} catch (error) {
							settleStart(error as Error);
						}
					});
					return httpStartPromise;
				},
				stop: async () => {
					if (httpPhase === "running") httpPhase = "stopping";
					await closeHttpServer();
					if (httpStartPromise !== null) await httpStartPromise.catch(() => undefined);
					httpPhase = "stopping";
					if (httpErrorListener !== null) {
						server.off("error", httpErrorListener);
						httpErrorListener = null;
					}
					if (ownsPidFile) {
						removePidFile(PORT);
						ownsPidFile = false;
					}
					await closeHttpServer();
				},
				stopGraceMs: CANVAS_HTTP_STOP_GRACE_MS,
				forceStop: forceCloseHttpServer,
			},
			{
				name: "websocket-server",
				start: () => {
					startWebSocketServer();
					logger.info(`WebSocket server running on ws://${formatHostForUrl(HOST)}:${PORT}`);
				},
				stop: closeWebSocketServer,
			},
			{ name: "browser-and-pending-operations", stop: closeBrowserOwners },
			{
				name: "checkout-snapshot-work",
				start: () => {
					acceptingCheckoutWork = true;
				},
				stop: stopCheckoutWork,
			},
		],
	});
	canvasLifetime = lifetime;
	cleanupProven = lifetime.cleanupProven;
	try {
		await lifetime.start();
	} catch (error) {
		reportStartupTerminal(canvasStartupFailureMessage(error));
		throw error;
	}
}

export { startServer };
export default app;
