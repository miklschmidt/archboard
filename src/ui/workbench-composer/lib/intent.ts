import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import type {
	WorkbenchComposerLink,
	WorkbenchComposerPlan,
	WorkbenchComposerRefusalCode,
	WorkbenchComposerTurnId,
} from "../contract.js";
import { readComposerLink } from "./link.js";
import { MAX_PROMPT_BYTES, REFUSAL_MESSAGES, REFUSAL_RECOVERIES } from "./vocabulary.js";

const encoder = new TextEncoder();

export function composerRefusal(code: WorkbenchComposerRefusalCode): WorkbenchComposerPlan {
	return Object.freeze({
		kind: "refuse",
		refusal: Object.freeze({
			code,
			message: REFUSAL_MESSAGES[code],
			recovery: REFUSAL_RECOVERIES[code],
		}),
	});
}

/**
 * Each non-executable link keeps the host's own sentence and gains the next
 * action that belongs to it: an unbound pane needs a workhorse, an inspect-only
 * link needs a different one, and an unavailable workbench needs time.
 */
function linkRefusal(link: WorkbenchComposerLink): WorkbenchComposerPlan | null {
	if (link.kind === "executable") return null;
	return Object.freeze({
		kind: "refuse",
		refusal: Object.freeze({
			code: link.kind,
			message: link.reason,
			recovery: REFUSAL_RECOVERIES[link.kind],
		}),
	});
}

/**
 * The prompt the closed contract accepts: non-empty, NUL-free, and within the
 * body's UTF-8 bound. Checked here so a message the host would reject is
 * refused with the person's text still in front of them, rather than spent on a
 * round trip.
 */
function promptRefusal(text: string): WorkbenchComposerRefusalCode | null {
	if (text.trim().length === 0) return "empty_prompt";
	if (text.includes("\0")) return "prompt_invalid";
	if (encoder.encode(text).byteLength > MAX_PROMPT_BYTES) return "prompt_too_long";
	return null;
}

/**
 * Idle submit is the literal `turn/start` body; submit while a turn is running
 * is the literal `turn/steer` body carrying the authoritative turn id the host
 * re-proves as `expectedTurnId`. Nothing else is ever sent from the composer's
 * send path: the composer does not queue, fork, or retry.
 */
export function planComposerSubmit(
	state: BrowserWorkbenchState,
	text: string,
): WorkbenchComposerPlan {
	const link = readComposerLink(state);
	const refusedLink = linkRefusal(link);
	if (refusedLink !== null) return refusedLink;
	if (link.kind !== "executable") return composerRefusal("unavailable");
	const refusedPrompt = promptRefusal(text);
	if (refusedPrompt !== null) return composerRefusal(refusedPrompt);
	if (link.turn.kind === "ambiguous") return composerRefusal("ambiguous_turn");
	if (link.turn.kind === "idle")
		return Object.freeze({
			kind: "dispatch",
			action: "start",
			draft: Object.freeze({ command: "start", threadId: link.threadId, prompt: text }),
		});
	return Object.freeze({
		kind: "dispatch",
		action: "steer",
		draft: Object.freeze({
			command: "steer",
			threadId: link.threadId,
			turnId: link.turn.turnId,
			prompt: text,
		}),
	});
}

/**
 * Interrupt targets the turn that was captured when the control was offered. A
 * turn that has since finished or been replaced is refused rather than
 * retargeted, so the person never interrupts work they were not looking at.
 */
export function planComposerInterrupt(
	state: BrowserWorkbenchState,
	capturedTurnId: WorkbenchComposerTurnId,
): WorkbenchComposerPlan {
	const link = readComposerLink(state);
	const refusedLink = linkRefusal(link);
	if (refusedLink !== null) return refusedLink;
	if (link.kind !== "executable") return composerRefusal("unavailable");
	if (link.turn.kind === "idle") return composerRefusal("no_active_turn");
	if (link.turn.kind === "ambiguous") return composerRefusal("ambiguous_turn");
	if (link.turn.turnId !== capturedTurnId) return composerRefusal("turn_changed");
	return Object.freeze({
		kind: "dispatch",
		action: "interrupt",
		draft: Object.freeze({
			command: "interrupt",
			threadId: link.threadId,
			turnId: capturedTurnId,
		}),
	});
}
