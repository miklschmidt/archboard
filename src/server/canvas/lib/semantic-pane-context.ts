// What every open pane is reading, as the pane last said it.
//
// A person asks "what does this do?" and means something on a screen. The board
// file cannot answer that: a variant holds every node it has, and which one is
// under discussion is a fact about a pane and nowhere else. So a pane reports
// what it is reading — board, variant, view, and the subjects picked out — and
// that report is what grounds the agent's context (ADR 0023).
//
// Two rules keep it honest. A report is never content: nothing here writes a
// board, takes a claim or advances a version, and a pane that reports is not
// editing anything. And a report never outlives its pane: it is kept by client
// id, and a read drops whatever belongs to a socket that has gone, so a closed
// tab cannot leave a true-looking answer standing after it stopped being true.

import type { Express, Request, Response } from "express";
import {
	SEMANTIC_PANE_CONTEXT_ROUTE,
	SemanticPaneContextSchema,
	type SemanticPaneContext,
} from "@/shared/semantic-pane-context/index";
import { publishPaneContext } from "@/server/canvas/lib/canvas-codex-host";
import { panePresentations } from "@/server/canvas/lib/pane-presentation";
import { panes } from "@/server/canvas/lib/pane-registry";
import { bodyOf } from "@/server/canvas/lib/request-board";

/** The latest report from each pane, by the client id that sent it. */
const reports = new Map<string, SemanticPaneContext>();

/**
 * Drop every report whose socket has gone.
 *
 * Rather than a farewell from an unloading tab, which is the one message a
 * browser cannot be relied on to send. The pane registry already knows which
 * sockets are live, so the reports follow it instead of keeping their own idea
 * of who is there.
 */
function pruneClosedPanes(): void {
	for (const clientId of reports.keys()) {
		if (!panes.has(clientId)) {
			reports.delete(clientId);
		}
	}
}

/**
 * Record what one pane says it is reading, unless the pane has already said
 * something later.
 *
 * Two reports from one pane can be in flight at once and HTTP does not promise
 * they arrive in the order they were sent. Keeping whichever arrived last would
 * let a selection the person has already moved on from stand for good, so the
 * pane's own count decides and an out-of-order arrival is dropped. Re-sending
 * the same report is not an error: it is the same fact, so it changes nothing.
 * @param report The pane's report.
 * @returns Whether this report is now the pane's current one.
 */
function recordSemanticPaneContext(report: SemanticPaneContext): boolean {
	// Deliberately not pruning here. Pruning is what a read does; doing it on the
	// way in would drop the very entry the sequence is compared against, so a pane
	// whose registration lapsed for a moment would forget its count and accept a
	// stale report that was still in flight. A report for a pane that has gone is
	// harmless: the next read drops it.
	const held = reports.get(report.clientId);
	if (held !== undefined && held.sequence >= report.sequence) {
		return false;
	}
	reports.set(report.clientId, report);
	return true;
}

/**
 * What one pane is reading, as it last said.
 * @param clientId The pane's socket.
 * @returns The report, or null when that pane has never reported or has gone.
 */
function semanticPaneContextFor(clientId: string): SemanticPaneContext | null {
	pruneClosedPanes();
	return reports.get(clientId) ?? null;
}

/**
 * Every live pane's report, in no particular order.
 * @returns The reports.
 */
function semanticPaneContexts(): readonly SemanticPaneContext[] {
	pruneClosedPanes();
	return [...reports.values()];
}

/** Forget every report, for a canvas that is starting over. */
function forgetSemanticPaneContexts(): void {
	reports.clear();
}

/**
 * Take one pane's report.
 * @param req The request.
 * @param res Its response.
 */
function reportRoute(req: Request, res: Response): void {
	const parsed = SemanticPaneContextSchema.safeParse(bodyOf(req));
	if (!parsed.success) {
		res.status(400).json({
			success: false,
			error: "That is not a semantic pane context.",
			problem: parsed.error.issues.map((issue) => issue.message).join("; "),
		});
		return;
	}
	const kept = recordSemanticPaneContext(parsed.data);
	if (kept) {
		// Storing it is not enough: the voice coordinator learns what a pane is
		// reading from this announcement, and without it a person picks something
		// out, asks what it does, and is answered about whatever they had picked
		// before. Only for a report that was kept — announcing one that lost to its
		// own successor would hand the coordinator the reading it just replaced.
		publishPaneContext(parsed.data.clientId, "selection", parsed.data.byUser ?? []);
		// The same report says where a presented walkthrough has got to, which is
		// what settles a step somebody narrating it asked for (TASK-251).
		panePresentations.note(parsed.data);
	}
	// A dropped report is not an error: a pane that raced itself has already been
	// overtaken by its own later one, and saying so lets a publisher notice it is
	// sending out of order.
	res.json({ success: true, paneId: parsed.data.paneId, kept });
}

/**
 * What the panes are reading, for anything that wants to see it without being
 * an agent: the same reports, in the shape they arrived.
 * @param _req The request.
 * @param res Its response.
 */
function listRoute(_req: Request, res: Response): void {
	res.json({ success: true, panes: semanticPaneContexts() });
}

/**
 * Mount the pane-context routes.
 * @param app The express application.
 */
function mountSemanticPaneContextRoutes(app: Express): void {
	app.post(SEMANTIC_PANE_CONTEXT_ROUTE, reportRoute);
	app.get(SEMANTIC_PANE_CONTEXT_ROUTE, listRoute);
}

export {
	forgetSemanticPaneContexts,
	mountSemanticPaneContextRoutes,
	recordSemanticPaneContext,
	semanticPaneContextFor,
	semanticPaneContexts,
};
