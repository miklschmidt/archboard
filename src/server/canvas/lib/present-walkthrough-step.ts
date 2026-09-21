// Presenting one step of a walkthrough for whoever is narrating it (TASK-251).
//
// The narrator names a step, and the first time a walkthrough. Everything else
// is settled here, from what the pane says is on screen and what the board file
// says: which board and variant, which walkthrough, whether it has that step,
// and what the step says. The pane is then asked for the step, and the answer
// waits until the pane's own report says the step has finished arriving — so
// the words handed back are never about a picture that is not there yet.

import {
	PRESENT_STEP_RESULT_LIMITS,
	type PresentStepInput,
	type PresentStepResult,
} from "@/runtime/codex-coordinator-tool-contract";
import type { CoordinatorToolPresentStepOutcome } from "@/runtime/codex-coordinator-tools";
import {
	resolveVariant,
	type SemanticBoard,
	type SemanticWalkthrough,
	type VariantContent,
} from "@/shared/semantic-board/index";
import type { PanePresentations, PresentOutcome } from "@/server/canvas/lib/pane-presentation";

/** What one pane is showing, as far as presenting a step needs to know. */
interface PresentedPane {
	/** The board on screen, by name. */
	readonly board: string;
	/** The variant on screen, by id or name; undefined for whichever is current. */
	readonly variant: string | undefined;
	/** The walkthrough the pane says it is presenting, or null. */
	readonly presenting: string | null;
}

/** What presenting a step needs of the canvas around it. */
interface PresentStepParts {
	readonly presentations: Pick<PanePresentations, "present">;
	/**
	 * What a pane is showing.
	 * @param paneId The pane, as the shell names it.
	 * @returns The board and variant on screen, or null when the pane has gone or shows no board.
	 */
	readonly paneShowing: (paneId: string) => PresentedPane | null;
	/**
	 * Read one board from the vault.
	 * @param name The board's name.
	 * @returns The board, or null when it cannot be read.
	 */
	readonly readBoard: (name: string) => SemanticBoard | null;
}

/** One request to present a step in one pane. */
interface PresentStepRequest {
	readonly paneId: string;
	readonly input: PresentStepInput;
	/** The walkthrough the voice session was started to present, or null. */
	readonly sessionWalkthrough: string | null;
	/**
	 * The last step of that walkthrough the narration stood on, counted from one: the one
	 * handed over last, or the one the person moved to by hand. Zero before the first.
	 */
	readonly lastStep: number;
	readonly signal: AbortSignal;
}

/**
 * Build a refusal.
 * @param reason The reviewed reason.
 * @param message What to tell the narrator.
 * @returns The refusal.
 */
function refused(
	reason: Extract<CoordinatorToolPresentStepOutcome, { readonly tag: "refused" }>["reason"],
	message: string,
): CoordinatorToolPresentStepOutcome {
	return { tag: "refused", reason, message };
}

/**
 * Cut text to a bound, saying that it was cut.
 * @param text The text.
 * @param limit The most characters to keep.
 * @returns The text, or its beginning and an ellipsis.
 */
function bounded(text: string, limit: number): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * The walkthrough a name means, by id first and then by name, whatever its case.
 * @param offered Every walkthrough the variant states.
 * @param asked What the narrator called it.
 * @returns The walkthrough, or null.
 */
function walkthroughNamed(
	offered: readonly SemanticWalkthrough[],
	asked: string,
): SemanticWalkthrough | null {
	const named = asked.trim().toLowerCase();
	return (
		offered.find((one) => one.id.toLowerCase() === named) ??
		offered.find((one) => one.name.trim().toLowerCase() === named) ??
		null
	);
}

/**
 * The walkthrough a variant states, when it states exactly one.
 * @param offered Every walkthrough the variant states.
 * @returns That walkthrough, or null when there are none or several.
 */
function onlyOne(offered: readonly SemanticWalkthrough[]): SemanticWalkthrough | null {
	return offered.length === 1 ? (offered[0] ?? null) : null;
}

/**
 * The walkthrough a request means: the one it names, else the one the narration
 * is already on, else the one the pane is presenting, else the only one there is.
 * @param offered Every walkthrough the variant states.
 * @param request The request.
 * @param pane What the pane is showing.
 * @returns The walkthrough, or null when the request does not settle one.
 */
function walkthroughMeant(
	offered: readonly SemanticWalkthrough[],
	request: PresentStepRequest,
	pane: PresentedPane,
): SemanticWalkthrough | null {
	if (request.input.walkthrough !== undefined) {
		return walkthroughNamed(offered, request.input.walkthrough);
	}
	const remembered = request.sessionWalkthrough ?? pane.presenting;
	return offered.find((one) => one.id === remembered) ?? onlyOne(offered);
}

/**
 * What to call one subject of a step, for somebody who will say it aloud.
 * @param content The variant's content.
 * @param nodes Every node's name, by id.
 * @param id The subject's id.
 * @returns Its name; a relationship is named by its ends; undefined for anything unnamed.
 */
function subjectName(
	content: VariantContent,
	nodes: ReadonlyMap<string, string>,
	id: string,
): string | undefined {
	const named = nodes.get(id) ?? content.flows.find((flow) => flow.id === id)?.name;
	if (named !== undefined) {
		return named;
	}
	const edge = content.edges.find((one) => one.id === id);
	/**
	 * What to call one end of the relationship.
	 * @param end The node's id.
	 * @returns Its name, or the id when the variant does not hold it.
	 */
	const endName = (end: string): string => nodes.get(end) ?? end;
	return edge === undefined ? undefined : `${endName(edge.from)} to ${endName(edge.to)}`;
}

/**
 * What to call the subjects a step is about.
 * @param content The variant's content.
 * @param subjects The step's subject ids.
 * @returns Their names, leaving out anything unnamed.
 */
function subjectNames(content: VariantContent, subjects: readonly string[]): string[] {
	const nodes = new Map(content.nodes.map((node) => [node.id, node.name]));
	return subjects
		.map((id) => subjectName(content, nodes, id))
		.filter((name): name is string => name !== undefined && name.length > 0)
		.map((name) => bounded(name, PRESENT_STEP_RESULT_LIMITS.nameChars))
		.slice(0, PRESENT_STEP_RESULT_LIMITS.subjects);
}

/** Why a pane did not arrive on a step, by how asking it ended. */
const REFUSALS: Readonly<
	Record<
		Extract<PresentOutcome, { readonly kind: "refused" }>["reason"],
		CoordinatorToolPresentStepOutcome
	>
> = {
	person_took_over: refused(
		"busy",
		"The person stepped the presentation by hand or left it while the step was on its way. Follow where they are before presenting another step.",
	),
	superseded: refused("busy", "A later step was asked of the same pane before this one arrived."),
	timeout: refused(
		"expired",
		"The pane did not say the step had arrived in time, so it may not be on screen.",
	),
	cancelled: refused("invalid_call", "The call was cancelled before the step arrived."),
	no_pane: refused("not_ready", "The voice-linked pane is not open on a board."),
	stopping: refused("not_ready", "The canvas is stopping."),
};

/**
 * Why a pane did not arrive on a step, as the narrator is told it.
 * @param outcome How asking the pane ended.
 * @returns The refusal.
 */
function refusalFor(
	outcome: Exclude<PresentOutcome, { readonly kind: "arrived" }>,
): CoordinatorToolPresentStepOutcome {
	return outcome.kind === "left"
		? refused("not_ready", "The pane left the presentation.")
		: REFUSALS[outcome.reason];
}

/** A step the board has, settled from what the pane is showing. */
interface SettledStep {
	readonly board: SemanticBoard;
	readonly content: VariantContent;
	readonly walkthrough: SemanticWalkthrough;
	readonly beat: SemanticWalkthrough["beats"][number];
	/** Which step that is, counted from one. */
	readonly step: number;
}

/**
 * The variant content a pane is showing, read from the vault.
 * @param parts The canvas around it.
 * @param pane What the pane is showing.
 * @returns The board and the variant's content, or null when it cannot be read.
 */
function contentOn(
	parts: Pick<PresentStepParts, "readBoard">,
	pane: PresentedPane,
): Pick<SettledStep, "board" | "content"> | null {
	const board = parts.readBoard(pane.board);
	const variant = board === null ? undefined : resolveVariant(board, pane.variant);
	return board === null || variant === undefined ? null : { board, content: variant.content };
}

/**
 * Why no walkthrough could be settled, naming what the board offers.
 * @param pane What the pane is showing.
 * @param offered Every walkthrough the variant states.
 * @returns The refusal.
 */
function unsettledWalkthrough(
	pane: PresentedPane,
	offered: readonly SemanticWalkthrough[],
): CoordinatorToolPresentStepOutcome {
	const names = offered.map((one) => `"${one.name}"`).join(", ");
	return refused(
		"invalid_call",
		offered.length === 0
			? `"${pane.board}" states no walkthrough for the variant on screen.`
			: `Name the walkthrough to present. "${pane.board}" offers: ${names}.`,
	);
}

/**
 * Settle which step of which walkthrough a request means, before any pane moves.
 * @param parts The canvas around it.
 * @param request The request.
 * @returns The step, or the refusal that stops it.
 */
function settleStep(
	parts: PresentStepParts,
	request: PresentStepRequest,
): SettledStep | CoordinatorToolPresentStepOutcome {
	const pane = parts.paneShowing(request.paneId);
	if (pane === null) {
		return REFUSALS.no_pane;
	}
	const shown = contentOn(parts, pane);
	if (shown === null) {
		return refused("not_loaded", `The board "${pane.board}" on that pane could not be read.`);
	}
	const offered = shown.content.walkthroughs;
	const walkthrough = walkthroughMeant(offered, request, pane);
	if (walkthrough === null) {
		return unsettledWalkthrough(pane, offered);
	}
	const step = stepMeant(request, walkthrough);
	const beat = walkthrough.beats[step - 1];
	return beat === undefined
		? refused("invalid_call", noSuchStep(walkthrough, step, request.input.step === undefined))
		: { ...shown, walkthrough, beat, step };
}

/**
 * The step a request means: the one it names, or the one after where the narration stands.
 *
 * A request usually names none. In a full-duplex voice session a delegation carries the person's
 * last utterance and never words the voice model composed, so the coordinator is not told which
 * step is wanted; the host is the one that knows where the talk has got to. Standing in another
 * walkthrough is standing nowhere in this one.
 * @param request The request.
 * @param walkthrough The walkthrough it settled on.
 * @returns The step, counted from one.
 */
function stepMeant(request: PresentStepRequest, walkthrough: SemanticWalkthrough): number {
	if (request.input.step !== undefined) {
		return request.input.step;
	}
	return request.sessionWalkthrough === walkthrough.id ? request.lastStep + 1 : 1;
}

/**
 * Why there is no such step, as the narrator is told it.
 * @param walkthrough The walkthrough.
 * @param step The step that was meant.
 * @param next Whether it was meant as the next step rather than named.
 * @returns What to tell the voice model.
 */
function noSuchStep(walkthrough: SemanticWalkthrough, step: number, next: boolean): string {
	const total = walkthrough.beats.length;
	return next
		? `The walkthrough "${walkthrough.name}" is complete: all ${total} steps have been presented. Tell the voice model to say so and invite questions; present nothing more.`
		: `"${walkthrough.name}" has ${total} steps; there is no step ${step}.`;
}

/**
 * What a step says, as the narrator is handed it.
 * @param settled The step.
 * @param step Which step it is, counted from one.
 * @returns The result value.
 */
function stepValue(settled: SettledStep, step: number): PresentStepResult {
	const { board, content, walkthrough, beat } = settled;
	const view = board.views.find((one) => one.id === beat.view)?.name;
	return {
		walkthroughId: walkthrough.id,
		walkthroughName: bounded(walkthrough.name, PRESENT_STEP_RESULT_LIMITS.nameChars),
		step,
		of: walkthrough.beats.length,
		heading: bounded(beat.heading, PRESENT_STEP_RESULT_LIMITS.headingChars),
		body: bounded(beat.body, PRESENT_STEP_RESULT_LIMITS.bodyChars),
		subjects: subjectNames(content, beat.subjects),
		view: view === undefined ? null : bounded(view, PRESENT_STEP_RESULT_LIMITS.nameChars),
	};
}

/**
 * Present one step of a walkthrough in one pane, and hand back what it says
 * once the pane has said it arrived.
 * @param parts The canvas around it.
 * @param request The pane, the step and, until it is known, the walkthrough.
 * @returns The step, or why it is not on screen.
 */
async function presentWalkthroughStep(
	parts: PresentStepParts,
	request: PresentStepRequest,
): Promise<CoordinatorToolPresentStepOutcome> {
	const settled = settleStep(parts, request);
	if ("tag" in settled) {
		return settled;
	}
	const outcome = await parts.presentations.present({
		paneId: request.paneId,
		walkthrough: settled.walkthrough.id,
		beat: settled.step - 1,
		signal: request.signal,
	});
	return outcome.kind === "arrived"
		? { tag: "ok", value: stepValue(settled, settled.step) }
		: refusalFor(outcome);
}

export {
	contentOn,
	presentWalkthroughStep,
	type PresentedPane,
	type PresentStepParts,
	type PresentStepRequest,
};
