import type { Express, Request, Response } from "express";
import { z } from "zod";
import { logger } from "@/runtime/engine/logger";
import { selectionState } from "@/runtime/engine/types";
import { boards } from "@/runtime/engine/board-store";
import { buildSelectionReport } from "@/runtime/engine/describe";
import { buildPanesReport, MAX_PANES, panesInOrder, resolvePaneSpec } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { presentElements } from "@/runtime/engine/presentation";
import { frontendState } from "@/runtime/engine/staleness";
import { PANE_LAYOUT_TIMEOUT_MS } from "@/shared/timing/timing";
import { boardElements } from "@/server/canvas/lib/board-announcements";
import { checkoutSnapshotFor } from "@/server/canvas/lib/board-response";
import { canvasUrl } from "@/server/canvas/lib/listener-address";
import { asyncEndpoint } from "@/server/canvas/lib/mutation-work";
import {
	boardForPane,
	boardsOnScreen,
	broadcastSelection,
	clientIds,
	clients,
	notePaneOpened,
	paneFromRequest,
	paneResponse,
	panes,
	pendingPaneCloses,
	pendingPaneOpens,
	primaryPane,
	sendLayoutToPane,
	settleAfterLayout,
	type PendingPaneClose,
	type PendingPaneOpen,
} from "@/server/canvas/lib/pane-registry";
import { bodyOf, messageOf } from "@/server/canvas/lib/request-board";

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

/**
 * No pane means no browser, which is a different thing from a bad request.
 * @param what The operation that needed a pane.
 * @returns The refusal body.
 */
function noBrowserBody(what: string): Record<string, unknown> {
	return {
		success: false,
		code: "BROWSER_REQUIRED",
		error:
			`${what} needs a canvas open in a browser. A pane exists only while a tab is rendering it, ` +
			`so there is nothing on screen to split or close. Open ${canvasUrl()} and retry.`,
	};
}

/**
 * Record what one pane has picked.
 * @param req The request.
 * @param res Its response.
 */
function postSelectionRoute(req: Request, res: Response): void {
	const parsed = SelectionSchema.safeParse(req.body);
	if (!parsed.success) {
		res
			.status(400)
			.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid selection" });
		return;
	}
	const { elementIds, clientId } = parsed.data;
	const at = new Date().toISOString();
	selectionState.current = elementIds.length === 0 ? null : { elementIds, clientId, at };
	// Per pane, an empty selection is a fact about that pane rather than the
	// absence of one: the human deselected *there* while another pane may still
	// hold something.
	if (elementIds.length === 0) {
		selectionState.byClient.delete(clientId);
	} else {
		selectionState.byClient.set(clientId, { elementIds, clientId, at });
	}
	logger.info(`Selection from ${clientId}: ${elementIds.length} element(s)`);
	broadcastSelection();
	res.json({ success: true, count: elementIds.length, elementIds });
}

/**
 * Report what one pane has picked, described against its board.
 * @param req The request.
 * @param res Its response.
 */
function getSelectionRoute(req: Request, res: Response): void {
	try {
		const pane = paneFromRequest(req.query["pane"]);
		if (!pane) {
			res.status(503).json(noBrowserBody("Reading a live selection"));
			return;
		}
		const key = boardForPane(pane);
		const board = boards.get(key);
		const report = buildSelectionReport(
			selectionState.byClient.get(pane.clientId) ?? null,
			board
				? presentElements(boardElements(board), {
						boardKey: key,
						checkoutSnapshot: checkoutSnapshotFor(res),
					})
				: [],
			clients.size,
		);
		res.json({ success: true, board: key, ...report });
	} catch (error) {
		res.status(400).json({ success: false, error: messageOf(error) });
	}
}

// ─── Panes ────────────────────────────────────────────────────
//
// What the human is currently looking at: which pane holds which board, where
// it sits on the display, how much of the board is on screen, and what is picked
// in it. View state, never contents — see panes.ts for why that line is
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
	// of what the server thinks it sent.
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

/**
 * Why a pane's telemetry was refused, named at the field that was wrong.
 * @param error What the schema reported.
 * @returns The refusal message.
 */
function paneTelemetryRefusal(error: z.ZodError): string {
	const issue = error.issues[0];
	const field = issue && issue.path.length > 0 ? issue.path.join(".") : "request";
	return `Invalid pane telemetry at ${field}: ${issue?.message ?? "invalid value"}`;
}

/**
 * A pane says what it is showing, and hears back whether it is out of date.
 *
 * This is the pulse a browser already has. A pane posts here when it connects,
 * on every change, and on every scroll, resize and zoom, so a tab that was
 * opened before somebody rebuilt the frontend finds out at its next
 * interaction. The alternative on offer was for the tab to discover it by
 * having a command time out on it ten seconds later, which is what used to
 * happen and what TASK-056 is about.
 * @param req The request.
 * @param res Its response.
 */
function postPaneRoute(req: Request, res: Response): void {
	const parsed = PaneSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ success: false, error: paneTelemetryRefusal(parsed.error) });
		return;
	}
	const frontend = frontendState(parsed.data.build);
	const staleFrontend = frontend.stale ? frontend : undefined;
	const { build, ...requiredRegistration } = parsed.data;
	const registration: PaneRegistration = {
		...requiredRegistration,
		...(build === undefined ? {} : { build }),
		at: new Date().toISOString(),
	};
	// A pane exists exactly as long as its socket. A report arriving without one
	// is a pane on its way out — React tears the canvas down in its own order, so
	// a last change can be reported after the close — and registering it would
	// resurrect the ghost the close just retired.
	const live = Array.from(clientIds.values()).includes(registration.clientId);
	if (!live) {
		res.json({ success: true, registered: false, paneCount: panes.size, staleFrontend });
		return;
	}
	const isNew = !panes.has(registration.clientId);
	panes.set(registration.clientId, registration);
	// A pane that was asked for has arrived. Registration is the acknowledgement
	// — see the pane layout section for why it is that and not a reply.
	if (isNew) {
		notePaneOpened(registration);
	}
	res.json({ success: true, registered: true, paneCount: panes.size, staleFrontend });
}

/**
 * Report every pane on screen.
 * @param _req The request.
 * @param res Its response.
 */
function getPanesRoute(_req: Request, res: Response): void {
	const report = buildPanesReport(Array.from(panes.values()), {
		/**
		 * The identity of an open board.
		 * @param key The board key.
		 * @returns The identity, or null when the board is not open.
		 */
		identity: (key) => boards.get(key)?.identity ?? null,
		/**
		 * The presented elements of an open board.
		 * @param key The board key.
		 * @returns The elements, or none when the board is not open.
		 */
		elements: (key) => {
			const board = boards.get(key);
			return board
				? presentElements(boardElements(board), {
						boardKey: key,
						checkoutSnapshot: checkoutSnapshotFor(res),
					})
				: [];
		},
		/**
		 * What one pane has picked.
		 * @param clientId The pane's client id.
		 * @returns Its selection, or null.
		 */
		selection: (clientId) => selectionState.byClient.get(clientId) ?? null,
		canvasUrl: canvasUrl(),
	});
	res.json({ success: true, ...report });
}

// ─── Pane layout ──────────────────────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. That made splitting something
// only a user could do: an agent told to put a proposal beside the current
// architecture had no second pane and no way to ask for one, so it reused the
// pane in front of the human and overwrote what was there (TASK-033).
//
// These two routes ask the browser to change its layout and then wait for the
// registry to agree. How long they wait is in timing.ts, because the settle
// cap is waiting out PANE_DEBOUNCE_MS, which is a number on the other side of
// the browser boundary.

/**
 * The refusal when the screen already shows as many panes as it can.
 * @returns The refusal body.
 */
function tooManyPanesBody(): Record<string, unknown> {
	const showing = panesInOrder(Array.from(panes.values()))
		.map((entry) => `${entry.place} (${boardForPane(entry.pane)})`)
		.join(", ");
	return {
		success: false,
		error:
			`The canvas is already showing ${panes.size} panes: ${showing}. ` +
			"Point one of them at another board with `browser show <name> --pane <spec>`, " +
			"or close one first with `browser close <spec>`.",
	};
}

/**
 * Wait for a pane the shell was asked to open, bounded by the layout timeout.
 * @returns The pending record and the promise of the pane.
 */
function awaitPaneOpen(): { pending: PendingPaneOpen; opened: Promise<PaneRegistration> } {
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
	return { pending, opened };
}

/**
 * Split the canvas: one more pane, side by side with what is already there.
 *
 * It takes no board. What lands in the new pane is a separate act — `browser
 * show ... --pane <the pane this answered with>` — so that showing a board
 * stays the one thing that decides which board a pane holds (ADR 0009).
 * @param _req The request.
 * @param res Its response.
 */
async function openPaneRoute(_req: Request, res: Response): Promise<void> {
	const answering = primaryPane();
	if (!answering) {
		res.status(503).json(noBrowserBody("Opening a pane"));
		return;
	}
	if (panes.size >= MAX_PANES) {
		res.status(409).json(tooManyPanesBody());
		return;
	}
	const askedAt = new Date().toISOString();
	const { pending, opened } = awaitPaneOpen();
	if (!sendLayoutToPane(answering.clientId, { type: "pane_open" })) {
		pendingPaneOpens.delete(pending);
		clearTimeout(pending.timeout);
		res.status(503).json(noBrowserBody("Opening a pane"));
		return;
	}
	try {
		const pane = await opened;
		// The new pane and every pane already on screen when the split was
		// asked for: the shell re-lays all of them side by side.
		await settleAfterLayout(askedAt, [...pending.known, pane.clientId]);
		logger.info(`Pane opened on request: ${pane.paneId} (${panes.size} on screen)`);
		res.json({
			success: true,
			...paneResponse(panes.get(pane.clientId) ?? pane),
			paneCount: panes.size,
			onScreen: boardsOnScreen(),
		});
	} catch (error) {
		res.status(504).json({ success: false, error: messageOf(error) });
	}
}

/**
 * Which pane a close request names, and how to call it in the answer.
 * @param registrations Every pane on screen.
 * @param spec The pane spec, possibly empty.
 * @returns The pane and its place.
 */
function closeTarget(
	registrations: PaneRegistration[],
	spec: string,
): { target: PaneRegistration; place: string } {
	if (!spec) {
		throw new Error(
			"Say which pane to close. " +
				panesInOrder(registrations)
					.map((entry) => `\`browser close ${entry.place}\` drops ${entry.pane.board}`)
					.join(", ") +
				".",
		);
	}
	const target = resolvePaneSpec(registrations, spec);
	const place =
		panesInOrder(registrations).find((entry) => entry.pane.clientId === target.clientId)?.place ??
		spec;
	return { target, place };
}

/**
 * Wait for a pane the shell was asked to close, bounded by the layout timeout.
 * @param clientId The pane's client id.
 * @param place How the answer names the pane.
 * @returns The pending record and the promise of the close.
 */
function awaitPaneClose(
	clientId: string,
	place: string,
): { pending: PendingPaneClose; closed: Promise<void> } {
	let pending!: PendingPaneClose;
	const closed = new Promise<void>((resolve, reject) => {
		pending = {
			clientId,
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
	return { pending, closed };
}

/**
 * Refuse to close a pane when it would leave nothing on screen, or when no
 * pane is on screen at all.
 * @param res The response.
 * @param count How many panes are on screen.
 * @returns True once a refusal has been sent.
 */
function refuseUnclosable(res: Response, count: number): boolean {
	if (count === 0) {
		res.status(503).json(noBrowserBody("Closing a pane"));
		return true;
	}
	if (count === 1) {
		res.status(409).json({
			success: false,
			error:
				"That is the only pane on screen, and closing it would leave the canvas showing nothing " +
				"with no way back except reloading the browser. Its board is unaffected either way — " +
				"point the pane somewhere else with `browser show <name> --pane <spec>` instead.",
		});
		return true;
	}
	return false;
}

/**
 * Close one pane, named the way every other pane is named.
 *
 * Always named: unlike opening a board, which can only land somewhere visible
 * and wrong, closing takes a board off the screen, and guessing which one is
 * the mistake that costs the human the half they were reading.
 * @param req The request.
 * @param res Its response.
 */
async function closePaneRoute(req: Request, res: Response): Promise<void> {
	const paneSpec = bodyOf(req)["pane"];
	const spec = typeof paneSpec === "string" ? paneSpec.trim() : "";
	const registrations = Array.from(panes.values());
	if (refuseUnclosable(res, registrations.length)) {
		return;
	}
	let target: PaneRegistration;
	let place: string;
	try {
		({ target, place } = closeTarget(registrations, spec));
	} catch (error) {
		res.status(400).json({ success: false, error: messageOf(error) });
		return;
	}
	const askedAt = new Date().toISOString();
	const { pending, closed } = awaitPaneClose(target.clientId, place);
	if (!sendLayoutToPane(target.clientId, { type: "pane_close" })) {
		pendingPaneCloses.delete(pending);
		clearTimeout(pending.timeout);
		res.status(503).json(noBrowserBody("Closing a pane"));
		return;
	}
	try {
		await closed;
		// The panes that stay: closing one widens the rest.
		await settleAfterLayout(
			askedAt,
			registrations
				.map((entry) => entry.clientId)
				.filter((clientId) => clientId !== target.clientId),
		);
		logger.info(`Pane closed on request: ${target.paneId} (${panes.size} left on screen)`);
		res.json({
			success: true,
			closed: { paneId: target.paneId, clientId: target.clientId, place, board: target.board },
			paneCount: panes.size,
			onScreen: boardsOnScreen(),
		});
	} catch (error) {
		res.status(504).json({ success: false, error: messageOf(error) });
	}
}

/**
 * Mount the selection routes.
 * @param app The application to mount on.
 */
function mountSelectionRoutes(app: Express): void {
	app.post("/api/selection", postSelectionRoute);
	app.get("/api/selection", getSelectionRoute);
}

/**
 * Mount the pane telemetry and layout routes.
 * @param app The application to mount on.
 */
function mountPaneRoutes(app: Express): void {
	app.post("/api/panes", postPaneRoute);
	app.get("/api/panes", getPanesRoute);
	app.post("/api/panes/open", asyncEndpoint(openPaneRoute));
	app.post("/api/panes/close", asyncEndpoint(closePaneRoute));
}

export { mountPaneRoutes, mountSelectionRoutes, noBrowserBody };
