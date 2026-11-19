import type { ArchitectureModelRead } from "@archboard/model-contract";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { staleFrontend } from "@archboard/server-lifecycle/server-host";
import { browserUrl } from "@archboard/workspace/source-checkout";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";

import type { AgentActivityMessage } from "#shared/protocol/pane-messages.ts";
import { shownConversationPath } from "#shared/protocol/shown-conversation.ts";
import type { PaneRegistration } from "#server/panes/rules/pane-layout.ts";
import {
	closePane,
	openPane,
	registerPane,
	type LayoutRefusal,
} from "#server/panes/services/pane-arrivals.ts";
import { mountSemanticPaneContextRoutes } from "#server/panes/services/context.ts";
import { panesReport } from "#server/panes/services/panes-report.ts";
import { shownConversationRoute } from "#server/panes/services/shown-conversation.ts";
import { showPaneRoute } from "#server/panes/routes/pane-show-route.ts";
import { followPaneActivity } from "#server/panes/sockets/pane-socket.ts";
import { serverUrl } from "#server/host/services/listener-address.ts";
import { bodyOf } from "#server/request/services/request-fields.ts";
import { requireVault, statedVault, vaultOfRequest } from "#server/request/services/vault.ts";

/** What the server lends the pane routes and sockets: the parts of a request and a show it owns. */
interface PaneHooks {
	/**
	 * Run an async route under the request's mutation lease, its failure reaching Express.
	 * @param route The route.
	 * @returns An ordinary Express handler.
	 */
	runMutation(route: (req: Request, res: Response) => Promise<void>): RequestHandler;
	/**
	 * Answer a model read that was refused, with the status the server gives that refusal.
	 * @param res The response.
	 * @param refusal The refused read.
	 */
	refuseRead(res: Response, refusal: Extract<ArchitectureModelRead, { success: false }>): void;
	/** Move every pane to its repository's chosen checkout, after a show chose one. */
	followRegistry(): void;
	/** Canonical model activity: a pane's socket holds its vault open and hears every snapshot on arrival. */
	agentActivity: {
		hold(vault: string): () => void;
		snapshots(): readonly AgentActivityMessage[];
	};
}

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
			`so there is nothing on screen to split or close. Open ${browserUrl(serverUrl())} and retry.`,
	};
}

// ─── Panes ────────────────────────────────────────────────────
//
// What the human is currently looking at: which pane holds which model and
// where it sits on the display. View state, never contents — see the pane
// report rules for why that line is worth holding. What is picked in a pane is
// its reading, which the semantic-context route takes.
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
	// The model this pane adopted — what it is actually showing, which is what
	// makes the report a description of the displayed scene rather than an echo
	// of what the server thinks it sent.
	paneKey: z.string().min(1).nullable(),
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
 * A pane posts here when its socket opens, when its element mounts, and when
 * its model or the options the shell gives it change, and it skips a report
 * equal to its last one. Scrolling, zooming and selecting change none of that,
 * so the reading a pane publishes at every selection and navigation answers the
 * same staleness rule, and a tab opened before somebody rebuilt the frontend
 * finds out at its next interaction either way (TASK-056, TASK-608).
 * The alternative was for the tab to discover it by having a command time out
 * on it ten seconds later.
 * @param req The request.
 * @param res Its response.
 */
function postPaneRoute(req: Request, res: Response): void {
	const parsed = PaneSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ success: false, error: paneTelemetryRefusal(parsed.error) });
		return;
	}
	const stale = staleFrontend(parsed.data.build);
	const { registered, code, paneCount } = registerPane(
		registrationOf(parsed.data, vaultOfRequest(req)),
	);
	res.json({
		success: true,
		registered,
		...(code === undefined ? {} : { code }),
		paneCount,
		staleFrontend: stale,
	});
}

/**
 * Report every pane on screen. A call may name the vault its command found, and each pane then
 * says whether it shows that vault. The report is about the screen, so a call that names none, or
 * one the server cannot read, is answered the same, with no pane its own.
 * @param req The request.
 * @param res Its response.
 */
function getPanesRoute(req: Request, res: Response): void {
	res.json({ success: true, ...panesReport(statedVault(req)) });
}

/** The status each refused layout change answers with. */
const LAYOUT_REFUSAL_STATUS: Record<LayoutRefusal["refusal"], number> = {
	"no-browser": 503,
	full: 409,
	"only-pane": 409,
	spec: 400,
	timeout: 504,
};

/**
 * Answer a layout change that was refused.
 * @param res The response.
 * @param refused Why it was refused.
 * @param what The operation, as a refusal for want of a browser names it.
 */
function refuseLayout(res: Response, refused: LayoutRefusal, what: string): void {
	res
		.status(LAYOUT_REFUSAL_STATUS[refused.refusal])
		.json(
			refused.refusal === "no-browser"
				? noBrowserBody(what)
				: { success: false, error: refused.error },
		);
}

/**
 * Split the canvas: one more pane, side by side with what is already there.
 * @param _req The request.
 * @param res Its response.
 */
async function openPaneRoute(_req: Request, res: Response): Promise<void> {
	const opened = await openPane();
	if (!opened.ok) {
		refuseLayout(res, opened, "Opening a pane");
		return;
	}
	const { pane, paneCount, onScreen } = opened;
	res.json({ success: true, pane, paneCount, onScreen });
}

/**
 * Close one pane, named the way every other pane is named.
 * @param req The request.
 * @param res Its response.
 */
async function closePaneRoute(req: Request, res: Response): Promise<void> {
	const paneSpec = bodyOf(req)["pane"];
	const closed = await closePane(typeof paneSpec === "string" ? paneSpec.trim() : "");
	if (!closed.ok) {
		refuseLayout(res, closed, "Closing a pane");
		return;
	}
	const { closed: pane, paneCount, onScreen } = closed;
	res.json({ success: true, closed: pane, paneCount, onScreen });
}

/**
 * Mount the pane telemetry, layout, reading and model-showing routes, and hand the pane sockets
 * the activity they follow.
 * @param app The application to mount on.
 * @param hooks What the server lends them.
 */
function mountPaneRoutes(app: Express, hooks: PaneHooks): void {
	followPaneActivity(hooks.agentActivity);
	app.post("/api/panes", requireVault, postPaneRoute);
	app.get("/api/panes", getPanesRoute);
	app.post(["/api/panes/show", "/api/browser/show"], requireVault, showPaneRoute(hooks));
	// The person's own act in the page, so only the page reaches it (ADR 0050).
	app.post(
		shownConversationPath(),
		createBrowserOriginGuard("mutation"),
		requireVault,
		shownConversationRoute,
	);
	app.post("/api/panes/open", hooks.runMutation(openPaneRoute));
	app.post("/api/panes/close", hooks.runMutation(closePaneRoute));
	mountSemanticPaneContextRoutes(app);
}

export { mountPaneRoutes, noBrowserBody };
export type { PaneHooks };
