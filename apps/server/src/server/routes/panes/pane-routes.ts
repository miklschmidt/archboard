import { publishPaneContext } from "@archboard/workbench/server";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { logger } from "@archboard/diagnostics/logger";
import {
	addressablePanes,
	MAX_PANES,
	panesInOrder,
	resolvePane,
} from "@archboard/server-lifecycle/panes";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import { frontendState } from "@archboard/server-lifecycle/server-host";
import { PANE_MS } from "@archboard/timing";
import {
	serverUrl,
	bodyOf,
	messageOf,
	requireVault,
	vaultOfRequest,
} from "@archboard/workbench/host";
import { asyncEndpoint } from "#server/middleware/mutation-work/mutation-work.ts";
import {
	boardForPane,
	boardsOnScreen,
	currentSocketsByClient,
	notePaneOpened,
	paneBoards,
	paneResponse,
	paneVaults,
	panes,
	pendingPaneCloses,
	pendingPaneOpens,
	primaryPane,
	sendBoardlessToPane,
	settleAfterLayout,
	type PendingPaneClose,
	type PendingPaneOpen,
} from "@archboard/workbench/panes";
import { showPaneRoute } from "#server/routes/panes/pane-show-route.ts";
import { shownConversationRoute } from "#server/routes/panes/shown-conversation-route.ts";
import { SHOWN_CONVERSATION_ROUTE } from "@archboard/workbench/browser-contract";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import { getPanesRoute } from "#server/routes/panes/pane-report-route.ts";

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
			`so there is nothing on screen to split or close. Open ${serverUrl()} and retry.`,
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
	// A recording page's pane (TASK-304), which nobody may address. Absent means an ordinary pane.
	recording: z.boolean().optional(),
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
 * What a pane reported, filed under the vault it named.
 * @param reported The validated report.
 * @param vault The vault the call named.
 * @returns The registration.
 */
function registrationOf(reported: z.infer<typeof PaneSchema>, vault: string): PaneRegistration {
	const { build, recording, ...requiredRegistration } = reported;
	return {
		...requiredRegistration,
		vault,
		...(build === undefined ? {} : { build }),
		...(recording === true ? { recording } : {}),
		at: new Date().toISOString(),
	};
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
	const vault = vaultOfRequest(req);
	const registration = registrationOf(parsed.data, vault);
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
		res.json({
			success: true,
			registered: false,
			paneCount: addressablePanes([...panes.values()]).length,
			staleFrontend,
		});
		return;
	}
	// A pane is in the vault the server last put it in (ADR 0050). A report naming
	// another was sent before the pane heard of its move, which this answer can
	// overtake, so the code says to wait for the move and report from there.
	if (paneVaults.get(registration.clientId) !== vault) {
		res.json({
			success: true,
			registered: false,
			code: "PANE_MOVED",
			paneCount: addressablePanes([...panes.values()]).length,
			staleFrontend,
		});
		return;
	}
	registerLivePane(registration);
	res.json({
		success: true,
		registered: true,
		paneCount: addressablePanes([...panes.values()]).length,
		staleFrontend,
	});
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
// cap is waiting out PANE_MS.report, which is a number on the other side of
// the browser boundary.

/**
 * The refusal when the screen already shows as many panes as it can.
 * @returns The refusal body.
 */
function tooManyPanesBody(): Record<string, unknown> {
	const onScreen = addressablePanes([...panes.values()]);
	const showing = panesInOrder(onScreen)
		.map((entry) => `${entry.place} (${boardForPane(entry.pane)})`)
		.join(", ");
	return {
		success: false,
		error:
			`The canvas is already showing ${onScreen.length} panes: ${showing}. ` +
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
			}, PANE_MS.layoutTimeout),
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
	if (addressablePanes([...panes.values()]).length >= MAX_PANES) {
		res.status(409).json(tooManyPanesBody());
		return;
	}
	const askedAt = new Date().toISOString();
	const { pending, opened } = awaitPaneOpen();
	if (!sendBoardlessToPane(answering.clientId, { type: "pane_open" })) {
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
		const onScreen = addressablePanes([...panes.values()]).length;
		logger.info(`Pane opened on request: ${pane.paneId} (${onScreen} on screen)`);
		res.json({
			success: true,
			...paneResponse(panes.get(pane.clientId) ?? pane),
			paneCount: onScreen,
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
	const target = resolvePane(registrations, spec);
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
			}, PANE_MS.layoutTimeout),
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
	const registrations = addressablePanes([...panes.values()]);
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
	if (!sendBoardlessToPane(target.clientId, { type: "pane_close" })) {
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
		const onScreen = addressablePanes([...panes.values()]).length;
		logger.info(`Pane closed on request: ${target.paneId} (${onScreen} left on screen)`);
		res.json({
			success: true,
			closed: { paneId: target.paneId, clientId: target.clientId, place, board: target.board },
			paneCount: onScreen,
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
	app.post("/api/panes", requireVault, postPaneRoute);
	app.get("/api/panes", getPanesRoute);
	app.post(["/api/panes/show","/api/browser/show"], requireVault, showPaneRoute);
	// The person's own act in the page, so only the page reaches it (ADR 0050).
	app.post(
		SHOWN_CONVERSATION_ROUTE,
		createBrowserOriginGuard("mutation"),
		requireVault,
		shownConversationRoute,
	);
	app.post("/api/panes/open", asyncEndpoint(openPaneRoute));
	app.post("/api/panes/close", asyncEndpoint(closePaneRoute));
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
 * The server is one operator's, but nothing stops a second browser (the ChatGPT desktop app,
 * on 2026-09-22) opening it too, and then "pane A" names two panes. Voice and narration address
 * the browser that started them (TASK-294); anything that still goes by the shell id alone may
 * land on the other one, and this line is how that is read afterwards. A recording page shares
 * the id with nobody: nothing goes by the shell id to it.
 * @param registration The pane that just arrived.
 */
function warnOfSharedPaneId(registration: PaneRegistration): void {
	if (registration.recording === true) {
		return;
	}
	const others = addressablePanes([...panes.values()]).filter(
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

}
