// Starting voice to narrate one walkthrough, and what the voice model is told as it goes (TASK-251).
//
// The user steps the presentation; the voice explains the step on screen. The server hands the
// voice model each step as speech once the pane shows it: the first when Narrate opens it, and
// every step the user moves to after that. Leaving is told the same way. No coordinator turn is
// involved and nothing asks for a next step: in a full-duplex (V3) session a handoff carries the
// latest user-side item replayed, never words the voice model chose (Codex 0.158.0,
// `delegation.created`), which is too little for the voice model to steer a talk through.
//
// A recording (TASK-304) is a narration nobody listens to live and nobody steps by hand: the
// recording page moves to the next step itself once the voice has finished the one on screen,
// so the voice is told to explain each step and fall silent, since silence is what moves the
// screen on. Its steps are handed over as "On screen now", and leaving is never told: the page
// ends a recording by stopping the session.
//
// A step is handed over with what it highlights on screen, named in words, and on a variant read
// against another — the board's current one, or on a board with none the one it came from — how
// each of those stands against it (TASK-309): the picture marks what was added and changed, and
// the voice can only explain what it is told.

import type { ChangeKind } from "@/shared/semantic-board/index";

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
	/** Whether the talk is recorded for later, with nobody listening or at the controls. */
	readonly recording: boolean;
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

/** What every presenting voice is told about the subjects a step hands over. */
const STEP_SUBJECTS_RULE =
	'A step may end with "It highlights", listing what the screen highlights for that step and, when the architecture on screen is not the current one, whether each was added or changed against the current architecture (on a board with none, against the one it was branched from) and what moved. Use it to say what the step is about and what changed, in your own words; never read the list out, say "highlighted", or name a change the list does not give.';

/**
 * What the voice model is told when it is started to narrate a walkthrough the user steps.
 * @param name The walkthrough's name.
 * @returns The section appended to the voice prompt.
 */
function narrationPrompt(name: string): string {
	return [
		`Walkthrough narration. The user pressed Narrate on the walkthrough "${presentationName(name)}". They step through it by hand on their screen, and you explain the step they are on. Each step reaches you as it lands on their screen, beginning "On the user's screen now", with which step of how many it is, its heading and what it says: the first as soon as the session starts, and every step they move to after that.`,
		"When a step reaches you, explain it at once, without waiting to be spoken to, as a good conference speaker would: what it shows and why it matters, in your own words and their language, with names and never ids, and at most one aside. Never say a step's number or the total aloud; their screen shows where they are. The number is how you know the last step: after it, say the walkthrough is complete and invite questions.",
		STEP_SUBJECTS_RULE,
		"Explain only the step you were handed last, and never one you have not been handed. When you have explained it, stop and wait: they move on when they are ready. Never ask for the next step, hand off for it, or go on to it by yourself.",
		"The step you were handed is all you need to explain it: never hand off to look anything up about a step, the rest of the walkthrough or the board. While you narrate, hand off only for a question they ask.",
		"They can move on while you are still explaining a step. A step that reaches you while you speak means they have moved on: end your sentence, say nothing more about the older step, and explain the new one at once. If several steps reach you while you speak, explain only the last of them. A step that reached you while you were speaking is never left unexplained: when you stop talking, the step you explain is always the last one handed to you, unless you have already explained it.",
		"If they interrupt, answer, handing the question to the coordinator when it needs the board, then finish the step if you were cut off. If you are told they left the walkthrough, acknowledge it in a few words and narrate nothing more.",
	].join("\n\n");
}

/**
 * What the voice model is told when it is started to narrate a walkthrough for a recording.
 * @param name The walkthrough's name.
 * @returns The section appended to the voice prompt.
 */
function recordingPrompt(name: string): string {
	return [
		`Recorded walkthrough. You are narrating the walkthrough "${presentationName(name)}" for a video people will watch later. Nobody is listening live, nobody will answer you, and nobody is at the controls: the screen moves to the next step by itself once you have finished explaining the one on it. Each step reaches you as it lands on screen, beginning "On screen now", with which step of how many it is, its heading and what it says.`,
		"When a step reaches you, explain it at once, as a good conference speaker would: what it shows and why it matters, in your own words, with names and never ids, in the language the step is written in. Keep it to a few sentences with at most one aside. The screen shows the heading and the text, so explain them rather than read them out. Never say a step's number or the total aloud; the number is how you know the last step.",
		STEP_SUBJECTS_RULE,
		"When you have explained a step, stop talking: your silence is what moves the screen on. Never ask or invite questions, never ask for the next step, never hand anything to the coordinator, and never say you are waiting. After the last step, close the walkthrough with one short sentence.",
	].join("\n\n");
}

/**
 * What the voice model is told when it is started to present a walkthrough: a narration the user
 * steps, or a recording that steps itself.
 * @param presentation The walkthrough, and whether the talk is recorded.
 * @returns The section appended to the voice prompt.
 */
function voicePresentationPrompt(presentation: RealtimePresentation): string {
	return presentation.recording
		? recordingPrompt(presentation.name)
		: narrationPrompt(presentation.name);
}

/** One thing a step highlights on screen, as the voice model is told it. */
interface StepSubject {
	/** What it is called: a part or a sequence by name, a relationship or a step by its ends and label. */
	readonly name: string;
	/** How it stands against the variant this one is read against, or null when there is none. */
	readonly standing: ChangeKind | null;
	/** For a changed subject, what moved, in words; otherwise empty. */
	readonly moved: readonly string[];
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
			/** What the step highlights, in the order the beat names it. */
			readonly subjects: readonly StepSubject[];
	  }
	| { readonly kind: "left" };

/**
 * One highlighted subject as the voice model is told it.
 * @param subject The subject.
 * @returns Its name, and how it changed when it did.
 */
function subjectSpeech(subject: StepSubject): string {
	if (subject.standing === null || subject.standing === "unchanged") {
		return subject.name;
	}
	const moved = subject.moved.length === 0 ? "" : `: ${subject.moved.join("; ")}`;
	return `${subject.name} (${subject.standing}${moved})`;
}

/**
 * What the voice model is handed, as speech, when a narrated walkthrough's step lands on screen
 * or the user leaves it.
 *
 * In a full-duplex session appended text is quiet context whatever role it carries, and nothing
 * asks for a response (Codex 0.158.0, `conversation_item_create_message`). What the voice model
 * says is what arrives as speakable text, the way a coordinator's answer does, so both are
 * speech: a step to explain now, and leaving to acknowledge. A recording's step is on a screen
 * nobody is watching live, and is named so.
 * @param change Where the walkthrough now is.
 * @param recording Whether the talk is recorded.
 * @returns The speakable text.
 */
function presentationSpeech(change: RealtimePresentationChange, recording: boolean): string {
	if (change.kind === "left") {
		return "The user left the walkthrough, so the narration is over.";
	}
	const body =
		change.body.length <= STEP_BODY_MAX_CHARS
			? change.body
			: `${change.body.slice(0, STEP_BODY_MAX_CHARS - 1)}…`;
	const where = recording ? "On screen now" : "On the user's screen now";
	const said = `${where}: step ${change.step} of ${change.of}, "${change.heading}". ${body}`;
	return change.subjects.length === 0
		? said
		: `${said}\nIt highlights: ${change.subjects.map(subjectSpeech).join("; ")}.`;
}

export {
	presentationSpeech,
	voicePresentationPrompt,
	type RealtimePresentation,
	type RealtimePresentationChange,
	type StepSubject,
};
