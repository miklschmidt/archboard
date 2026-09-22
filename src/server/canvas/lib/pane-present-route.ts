// Asking one pane for a step of a walkthrough, over the loopback interface.
//
// The same request a narrating voice agent makes through its typed tool
// (TASK-251), for anything else that drives a presentation: a browser owner
// proving the round trip, or somebody at a terminal. Nothing is written and no
// position is set: the pane is asked, and the answer waits for the pane's own
// report that the step has finished arriving, or says why it did not.

import type { Request, Response } from "express";
import { z } from "zod";

import { panePresentations } from "@/server/canvas/lib/pane-presentation";
import { paneFromRequest } from "@/server/canvas/lib/pane-registry";
import { bodyOf, messageOf } from "@/server/canvas/lib/request-board";

/** What one request names: the pane, the walkthrough by id, and the beat from zero. */
const PanePresentBodySchema = z
	.object({
		pane: z.string().min(1).max(128),
		/** Null asks the pane to leave the presentation. */
		walkthrough: z.string().min(1).max(64).nullable(),
		beat: z.int().min(0).max(999).default(0),
	})
	.strict();

/**
 * Ask a pane for a step, and answer once it has arrived or could not.
 * @param req The request.
 * @param res Its response.
 */
async function presentPaneRoute(req: Request, res: Response): Promise<void> {
	const parsed = PanePresentBodySchema.safeParse(bodyOf(req));
	if (!parsed.success) {
		res.status(400).json({
			success: false,
			error: "Name a pane, a walkthrough id or null, and a beat counted from zero.",
			problem: parsed.error.issues.map((issue) => issue.message).join("; "),
		});
		return;
	}
	const { pane, walkthrough, beat } = parsed.data;
	// The pane is resolved here, as every route resolves one: the port itself takes the
	// exact client id, because a shell id may name a pane in more than one browser. A pane
	// the resolver cannot name — none, or two browsers' — is the same refusal, with its words.
	let named: ReturnType<typeof paneFromRequest>;
	try {
		named = paneFromRequest(pane);
	} catch (error) {
		res.status(409).json({
			success: false,
			code: "NO_PANE",
			error: messageOf(error),
			outcome: { kind: "refused", reason: "no_pane" },
		});
		return;
	}
	const outcome =
		named === null
			? { kind: "refused" as const, reason: "no_pane" as const }
			: await panePresentations.present({ clientId: named.clientId, walkthrough, beat });
	if (outcome.kind === "refused") {
		res.status(409).json({ success: false, code: outcome.reason.toUpperCase(), outcome });
		return;
	}
	res.json({ success: true, outcome });
}

export { presentPaneRoute };
