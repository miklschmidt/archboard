// Starting voice to narrate one walkthrough, and what the voice model is told as it goes (TASK-251).
//
// The user steps the presentation; the voice explains the step on screen. The host hands the
// voice model each step as speech once the pane shows it: the first when Narrate opens it, and
// every step the user moves to after that. Leaving is told the same way. No coordinator turn is
// involved and nothing asks for a next step: in a full-duplex (V3) session a handoff carries the
// latest user-side item replayed, never words the voice model chose (Codex 0.155.1,
// `delegation.created`), which is too little for the voice model to steer a talk through.

/** How much of a walkthrough's name a start carries, in characters. */
const PRESENTATION_NAME_MAX_CHARS = 200;

/** How much of a step's body the voice model is handed, in characters. */
const STEP_BODY_MAX_CHARS = 1_500;

/**
 * The walkthrough a voice session was started to present, as the start carries it: which one,
 * and what to call it. Nothing of what it says: a step's words reach the voice model only once
 * the step is on the user's screen.
 */
interface RealtimePresentation {
	/** The walkthrough's id. */
	readonly walkthrough: string;
	/** Its name, so the voice model knows what it is presenting. */
	readonly name: string;
}

/**
 * The walkthrough's name as a start carries it.
 * @param name The name as the board states it.
 * @returns The name, cut when it is longer than a start carries.
 */
function presentationName(name: string): string {
	return name.length <= PRESENTATION_NAME_MAX_CHARS
		? name
		: `${name.slice(0, PRESENTATION_NAME_MAX_CHARS - 1)}…`;
}

/**
 * What the voice model is told when it is started to present a walkthrough.
 * @param name The walkthrough's name.
 * @returns The section appended to the voice prompt.
 */
function voicePresentationPrompt(name: string): string {
	return [
		`Walkthrough narration. The user pressed Narrate on the walkthrough "${presentationName(name)}". They step through it by hand on their screen, and you explain the step they are on. Each step reaches you as it lands on their screen, beginning "On the user's screen now", with which step of how many it is, its heading and what it says: the first as soon as the session starts, and every step they move to after that.`,
		"When a step reaches you, explain it at once, without waiting to be spoken to, as a good conference speaker would: what it shows and why it matters, in your own words and their language, with names and never ids, and at most one aside. Never say a step's number or the total aloud; their screen shows where they are. The number is how you know the last step: after it, say the walkthrough is complete and invite questions.",
		"Explain only the step you were handed last, and never one you have not been handed. When you have explained it, stop and wait: they move on when they are ready. Never ask for the next step, hand off for it, or go on to it by yourself.",
		"If they interrupt, answer, handing the question to the coordinator when it needs the board, then finish the step if you were cut off. If a new step reaches you while you are speaking, drop the old one and explain the new one. If you are told they left the walkthrough, acknowledge it in a few words and narrate nothing more.",
	].join("\n\n");
}

/** Where a narrated walkthrough now is on the user's screen. */
type RealtimePresentationChange =
	| {
			readonly kind: "stepped";
			/** The step now on screen, counted from one. */
			readonly step: number;
			readonly of: number;
			readonly heading: string;
			readonly body: string;
	  }
	| { readonly kind: "left" };

/**
 * What the voice model is handed, as speech, when a narrated walkthrough's step lands on screen
 * or the user leaves it.
 *
 * In a full-duplex session appended text is quiet context whatever role it carries, and nothing
 * asks for a response (Codex 0.155.1, `conversation_item_create_message`). What the voice model
 * says is what arrives as speakable text, the way a coordinator's answer does, so both are
 * speech: a step to explain now, and leaving to acknowledge.
 * @param change Where the walkthrough now is.
 * @returns The speakable text.
 */
function presentationSpeech(change: RealtimePresentationChange): string {
	if (change.kind === "left") {
		return "The user left the walkthrough, so the narration is over.";
	}
	const body =
		change.body.length <= STEP_BODY_MAX_CHARS
			? change.body
			: `${change.body.slice(0, STEP_BODY_MAX_CHARS - 1)}…`;
	return `On the user's screen now: step ${change.step} of ${change.of}, "${change.heading}". ${body}`;
}

export {
	presentationSpeech,
	voicePresentationPrompt,
	type RealtimePresentation,
	type RealtimePresentationChange,
};
