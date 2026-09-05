// The plans: what a submit, queue or interrupt sends, or why the composer
// refuses it before anything leaves the browser.

import type {
	BrowserWorkbenchState,
	WorkbenchComposerDelivery,
	WorkbenchComposerLink,
	WorkbenchComposerPlan,
	WorkbenchComposerRefusalCode,
	WorkbenchComposerThreadId,
	WorkbenchComposerTurn,
	WorkbenchComposerTurnId,
} from "@/ui/workbench-composer/lib/contract";
import { readComposerLink } from "@/ui/workbench-composer/lib/link";
import {
	MAX_PROMPT_BYTES,
	REFUSAL_MESSAGES,
	REFUSAL_RECOVERIES,
} from "@/ui/workbench-composer/lib/vocabulary";

const encoder = new TextEncoder();

type ExecutableLink = Extract<WorkbenchComposerLink, { readonly kind: "executable" }>;

/**
 * A refusal plan.
 * @param code Why.
 * @returns The plan.
 */
function composerRefusal(code: WorkbenchComposerRefusalCode): WorkbenchComposerPlan {
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
 * action that belongs to it.
 * @param link The link.
 * @returns A refusal, or null for an executable link.
 */
function linkRefusal(link: WorkbenchComposerLink): WorkbenchComposerPlan | null {
	if (link.kind === "executable") {
		return null;
	}
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
 * The executable link, or the refusal that stands in its place.
 * @param state The transport state.
 * @returns The link or a refusal plan.
 */
function executableLinkOrRefusal(
	state: BrowserWorkbenchState,
): ExecutableLink | WorkbenchComposerPlan {
	const link = readComposerLink(state);
	return link.kind === "executable" ? link : (linkRefusal(link) ?? composerRefusal("unavailable"));
}

/**
 * The prompt the closed contract accepts: non-empty, NUL-free, and within the
 * body's UTF-8 bound. Checked here so a message the host would reject is
 * refused with the person's text still in front of them.
 * @param text The prompt.
 * @returns A refusal code, or null.
 */
function promptRefusal(text: string): WorkbenchComposerRefusalCode | null {
	if (text.trim().length === 0) {
		return "empty_prompt";
	}
	if (text.includes("\0")) {
		return "prompt_invalid";
	}
	return encoder.encode(text).byteLength > MAX_PROMPT_BYTES ? "prompt_too_long" : null;
}

/**
 * The literal `turn/start` body.
 * @param threadId The thread.
 * @param text The prompt.
 * @returns The plan.
 */
function startPlan(threadId: WorkbenchComposerThreadId, text: string): WorkbenchComposerPlan {
	return Object.freeze({
		kind: "dispatch",
		action: "start",
		draft: Object.freeze({ command: "start", threadId, prompt: text }),
	});
}

/**
 * The literal `turn/steer` body against the authoritative turn.
 * @param threadId The thread.
 * @param turn The turn read.
 * @param text The prompt.
 * @returns The plan, or a refusal without one active turn.
 */
function steerPlan(
	threadId: WorkbenchComposerThreadId,
	turn: WorkbenchComposerTurn,
	text: string,
): WorkbenchComposerPlan {
	if (turn.kind === "ambiguous") {
		return composerRefusal("ambiguous_turn");
	}
	if (turn.kind === "idle") {
		return composerRefusal("no_active_turn");
	}
	return Object.freeze({
		kind: "dispatch",
		action: "steer",
		draft: Object.freeze({ command: "steer", threadId, turnId: turn.turnId, prompt: text }),
	});
}

/**
 * The plan for one delivery choice against an executable link.
 * @param link The link.
 * @param text The prompt.
 * @param delivery The delivery choice.
 * @returns The plan.
 */
function deliveryPlan(
	link: ExecutableLink,
	text: string,
	delivery: WorkbenchComposerDelivery,
): WorkbenchComposerPlan {
	switch (delivery) {
		case "send":
			return startPlan(link.threadId, text);
		case "steer":
			return steerPlan(link.threadId, link.turn, text);
		case "queue":
			return Object.freeze({
				kind: "dispatch",
				action: "queue",
				draft: Object.freeze({ command: "queueAdd", prompt: text }),
			});
		default:
			return link.turn.kind === "idle"
				? startPlan(link.threadId, text)
				: steerPlan(link.threadId, link.turn, text);
	}
}

/**
 * What a submit sends. With `auto`, an idle submit is the literal `turn/start`
 * body and a submit while a turn runs is the literal `turn/steer` body carrying
 * the authoritative turn id the host re-proves as `expectedTurnId`. Nothing
 * else is ever sent from the send path: the composer does not fork or retry.
 * @param state The transport state.
 * @param text The prompt.
 * @param delivery The delivery choice.
 * @returns The plan.
 */
function planComposerSubmit(
	state: BrowserWorkbenchState,
	text: string,
	delivery: WorkbenchComposerDelivery = "auto",
): WorkbenchComposerPlan {
	const link = executableLinkOrRefusal(state);
	if (link.kind !== "executable") {
		return link;
	}
	const refusedPrompt = promptRefusal(text);
	if (refusedPrompt !== null) {
		return composerRefusal(refusedPrompt);
	}
	return deliveryPlan(link, text, delivery);
}

/**
 * Interrupt targets the turn that was captured when the control was offered.
 * A turn that has since finished or been replaced is refused rather than
 * retargeted, so the person never interrupts work they were not looking at.
 * @param state The transport state.
 * @param capturedTurnId The turn the control was offered for.
 * @returns The plan.
 */
function planComposerInterrupt(
	state: BrowserWorkbenchState,
	capturedTurnId: WorkbenchComposerTurnId,
): WorkbenchComposerPlan {
	const link = executableLinkOrRefusal(state);
	if (link.kind !== "executable") {
		return link;
	}
	const { turn } = link;
	if (turn.kind === "idle") {
		return composerRefusal("no_active_turn");
	}
	if (turn.kind === "ambiguous") {
		return composerRefusal("ambiguous_turn");
	}
	if (turn.turnId !== capturedTurnId) {
		return composerRefusal("turn_changed");
	}
	return Object.freeze({
		kind: "dispatch",
		action: "interrupt",
		draft: Object.freeze({ command: "interrupt", threadId: link.threadId, turnId: capturedTurnId }),
	});
}

export { composerRefusal, planComposerInterrupt, planComposerSubmit };
