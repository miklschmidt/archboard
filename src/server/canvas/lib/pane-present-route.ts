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
import { bodyOf } from "@/server/canvas/lib/request-board";

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
	const outcome = await panePresentations.present({ paneId: pane, walkthrough, beat });
	if (outcome.kind === "refused") {
		res.status(409).json({ success: false, code: outcome.reason.toUpperCase(), outcome });
		return;
	}
	res.json({ success: true, outcome });
}

export { presentPaneRoute };
