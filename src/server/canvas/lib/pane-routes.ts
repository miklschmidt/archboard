import { publishPaneContext } from "@/server/canvas/lib/canvas-codex-host";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { logger } from "@/runtime/engine/logger";
import { parseBoardKey } from "@/runtime/engine/board";
import { buildPanesReport, MAX_PANES, panesInOrder, resolvePaneSpec } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { frontendState } from "@/runtime/engine/staleness";
import { PANE_LAYOUT_TIMEOUT_MS } from "@/shared/timing/timing";
import { canvasUrl } from "@/server/canvas/lib/listener-address";
import { asyncEndpoint } from "@/server/canvas/lib/mutation-work";
import {
	aggregateOf,
	boardForPane,
	boardsOnScreen,
	currentSocketsByClient,
	notePaneOpened,
	paneBoards,
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
import { tellPaneAboutLock } from "@/server/canvas/lib/board-announcements";
import { noteBoardShown } from "@/server/canvas/lib/semantic-disk-watch";
import { showPaneRoute } from "@/server/canvas/lib/pane-show-route";
import { presentPaneRoute } from "@/server/canvas/lib/pane-present-route";
import { semanticPaneContextFor } from "@/server/canvas/lib/semantic-pane-context";
import type { SemanticPaneContext } from "@/shared/semantic-pane-context";
import { bodyOf, messageOf } from "@/server/canvas/lib/request-board";

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

// ─── Panes ────────────────────────────────────────────────────
//
// What the human is currently looking at: which pane holds which board, where
// it sits on the display, how much of the board is on screen, and what is picked
// in it. View state, never contents — see panes.ts for why that line is
// worth holding.
//
// This is pushed by the browser and read back off the server,
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
	// The board this pane adopted — what it is actually showing, which is what
	// makes the report a description of the displayed scene rather than an echo
	// of what the server thinks it sent.
	board: z.string().min(1).nullable(),
	primary: z.boolean(),
	focused: z.boolean(),
	rect: RectSchema,
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
	// A pane exists exactly as long as the socket that owns it. A report arriving
	// without one is either a pane on its way out — React tears the canvas down
	// in its own order, so a last change can be reported after the close — or one
	// whose socket has said which pane it is for but has not yet taken that
	// pane's authority. Registering either would answer `registered: true` to a
	// pane nothing can be sent to: the socket's listeners are attached with its
	// authority, so a workbench request answered in that window is dropped on the
	// floor. The tab reports again, and the next one lands.
	const live = currentSocketsByClient.has(registration.clientId);
	if (!live) {
		res.json({ success: true, registered: false, paneCount: panes.size, staleFrontend });
		return;
	}
	registerLivePane(registration);
	res.json({ success: true, registered: true, paneCount: panes.size, staleFrontend });
}

/**
 * What one pane last said it was reading, when that is still about the board
 * it is now showing.
 *
 * A move and a report cross: the server points a pane at B and the pane's last
 * report still names A, which arrived while it was there and was true then.
 * Reported under B it would say that somebody has picked out subjects of B — by
 * ids that belong to A, and which may name something else entirely on B. The
 * board's own answer stands; what the person picked out does not, until the
 * pane says what it is reading now, which it does on its next render.
 * @param clientId The pane's client id.
 * @returns The reading, or null when it is about another board.
 */
function readingAboutBoard(clientId: string): SemanticPaneContext | null {
	const context = semanticPaneContextFor(clientId);
	if (context === null) {
		return null;
	}
	const pane = panes.get(clientId);
	const showing = pane === undefined ? null : boardForPane(pane);
	if (showing === null) {
		return null;
	}
	return context.board?.key === showing ? context : null;
}

/**
 * Report every pane on screen.
 * @param _req The request.
 * @param res Its response.
 */
function getPanesRoute(_req: Request, res: Response): void {
	const report = buildPanesReport(Array.from(panes.values()), {
		/**
		 * The identity a board key spells.
		 * @param key The board key.
		 * @returns The identity.
		 */
		identity: (key) => parseBoardKey(key),
		/**
		 * What one pane last reported reading: its variant, its view and what the
		 * person picked out (ADR 0023).
		 * @param clientId The pane's client id.
		 * @returns The reading, or null when the pane has said nothing.
		 */
		reading: (clientId) => {
			const context = readingAboutBoard(clientId);
			if (context === null) {
				return null;
			}
			return {
				variant: context.variant,
				view: context.view,
				selection: context.selection.map((subject) => ({
					id: subject.id,
					...(subject.kind === undefined ? {} : { kind: subject.kind }),
					...(subject.name === undefined ? {} : { name: subject.name }),
				})),
				version: context.version,
				at: context.at,
			};
		},
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
 * Mount the pane telemetry, layout and board-showing routes.
 * @param app The application to mount on.
 */
function mountPaneRoutes(app: Express): void {
	app.post("/api/panes", postPaneRoute);
	app.get("/api/panes", getPanesRoute);
	app.post("/api/panes/show", showPaneRoute);
	app.post("/api/panes/open", asyncEndpoint(openPaneRoute));
	app.post("/api/panes/close", asyncEndpoint(closePaneRoute));
	app.post("/api/panes/present", asyncEndpoint(presentPaneRoute));
}

export { arrivedOnBoard, mountPaneRoutes, noBrowserBody };

/**
 * Register a live pane, acknowledge its arrival and publish changed focus.
 * @param registration The latest pane telemetry.
 */
function registerLivePane(registration: PaneRegistration): void {
	const previous = panes.get(registration.clientId);
	panes.set(registration.clientId, registration);
	// A pane that was asked for has arrived. Registration is the acknowledgement
	// — see the pane layout section for why it is that and not a reply.
	if (previous === undefined) {
		notePaneOpened(registration);
		warnOfSharedPaneId(registration);
	}
	noteWhatChanged(previous, registration);
}

/**
 * Say so when a second browser presents a pane id another live browser already holds.
 *
 * The canvas is one operator's, but nothing stops a second browser (the ChatGPT desktop app,
 * on 2026-09-22) opening it too, and then "pane A" names two panes. Voice and narration address
 * the browser that started them (TASK-294); anything that still goes by the shell id alone may
 * land on the other one, and this line is how that is read afterwards.
 * @param registration The pane that just arrived.
 */
function warnOfSharedPaneId(registration: PaneRegistration): void {
	const others = [...panes.values()].filter(
		(one) => one.paneId === registration.paneId && one.clientId !== registration.clientId,
	);
	if (others.length > 0) {
		const ids = others.map((one) => one.clientId).join(", ");
		logger.warn(
			`Pane ${registration.paneId} is presented by two browsers: ${registration.clientId} ` +
				`arrived while ${ids} still holds it. Voice addresses the browser it was started from.`,
		);
	}
}

/**
 * Act on what this registration says that the last one did not.
 * @param previous What this pane said last time, or nothing when it is new.
 * @param registration What it says now.
 */
function noteWhatChanged(
	previous: PaneRegistration | undefined,
	registration: PaneRegistration,
): void {
	const board = registration.board;
	const moved = previous?.board !== board;
	if (moved && board !== null) {
		arrivedOnBoard(registration.clientId, board);
	}
	const userChanged = focusChange(previous, registration);
	if (moved || userChanged.length > 0) {
		publishPaneContext(registration.clientId, "focus", userChanged);
	}
}

/**
 * What of a registration the user changed by hand. Which pane they are in moves only by their
 * own hand, because nothing the server sends a browser changes it (ADR 0034); a pane that only
 * moved to another board says so in its reading, which carries its own marks, and a pane that
 * has just opened has moved nowhere.
 * @param previous What this pane said last time, or nothing when it is new.
 * @param registration What it says now.
 * @returns The focus, or nothing.
 */
function focusChange(
	previous: PaneRegistration | undefined,
	registration: PaneRegistration,
): readonly "focus"[] {
	return previous !== undefined && previous.focused !== registration.focused ? ["focus"] : [];
}

/**
 * A pane is on a board, so record it and tell it where that board stands.
 *
 * Registration is the pane saying what it is showing, and a pane that has just
 * arrived on a board may be arriving into one an agent already holds and is
 * part way through. Being told outright is what ADR 0016 requires of every
 * arrival; a broadcast only reaches whoever was already there.
 * @param clientId The pane's client id.
 * @param board The board it is now showing.
 */
function arrivedOnBoard(clientId: string, board: string): void {
	paneBoards.set(clientId, board);
	// What the board's file is right now, which is what this pane is about to
	// read. Anything that replaces it after this is a change the pane has to
	// hear about, and taking the baseline any later would let one slip past.
	noteBoardShown(aggregateOf(board) ?? board);
	tellPaneAboutLock(clientId, board);
}
