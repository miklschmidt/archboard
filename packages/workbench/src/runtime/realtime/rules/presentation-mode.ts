// Starting voice to narrate one walkthrough, and what the voice model is told as it goes (TASK-251).
//
// The user steps the presentation; the voice explains the step on screen. The server hands the
// voice model each step as speech once the pane shows it: the first when Narrate opens it, and
// every step the user moves to after that. Leaving is told the same way. No coordinator turn is
// involved and nothing asks for a next step: in a full-duplex (V3) session a handoff carries the
// latest user-side item replayed, never words the voice model chose (Codex 0.160.0 to 0.166.0,
// `delegation.created`), which is too little for the voice model to steer a talk through.
//
// A recording (TASK-304) is a narration nobody listens to live and nobody steps by hand: the
// recording page moves to the next step itself once the voice has finished the one on screen,
// so the voice is told to explain each step and fall silent, since silence is what moves the
// screen on. Leaving is never told: the page ends a recording by stopping the session.
//
// A recording is heard once, later, by a reviewer, so it is told as an explanation of the system
// and not as a tour of a screen (TASK-478.02). Its voice gets the live persona with a recording
// section of its own, and none of the conversation rules. The section turns the persona's humour
// down by a quarter. Handed each step as "On screen now: step 2 of 5", a recording opened beats
// with "On screen now: step two" and "This step is about", and closed with "That completes the
// walkthrough". So a recorded step is handed over as what to explain, with its heading and body
// but never where it is or which step it is, and the prompt asks for no opening or closing line,
// so the voice needs no step number.
//
// A recording is narrated in one language, named outright at the start of its prompt and again
// where a step is explained (TASK-380). Codex sets no language anywhere in a realtime session and
// hands the voice model this prompt as it is (Codex 0.158.0 to 0.166.0,
// `prepare_realtime_backend_prompt`), so the prompt is the only place a language can come from.
// Told only to use the language each step is written in, the voice still narrated English steps in
// French. A live narration names none: it speaks the user's language, as a conversation does.
//
// A live narration hands its steps over the same way (TASK-563). Told "On the user's screen now:
// step 2 of 5", a live voice talked about the screen ("Now it says", "This step shows"), said the
// numbers, and asked whether to go on. So a live step is what to explain too, with its heading and
// no number. Only the last says where it is, because that is when the talk ends.
//
// A step is handed over with what it highlights on screen, named in words, and on a variant read
// against another — the model's current one, or on a model with none the one it came from — how
// each of those stands against it (TASK-309): the picture marks what was added and changed, and
// the voice can only explain what it is told.

import type { ChangeKind } from "@archboard/model/comparison";
import type { z } from "zod";
import { languageName, type RecordingNarrationSchema } from "@archboard/walkthrough/recording";

/** What voice is told when it narrates a recording. */
type RecordingNarration = z.infer<typeof RecordingNarrationSchema>;

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
	/**
	 * For a talk recorded for later, with nobody listening or at the controls, the language it is
	 * narrated in. Null for a narration somebody is listening to.
	 */
	readonly recording: RecordingNarration | null;
}

/**
 * The walkthrough's name as a start carries it.
 * @param name The name as the model states it.
 * @returns The name, cut when it is longer than a start carries.
 */
function presentationName(name: string): string {
	return name.length <= PRESENTATION_NAME_MAX_CHARS
		? name
		: `${name.slice(0, PRESENTATION_NAME_MAX_CHARS - 1)}…`;
}

/** What a step begins with when the voice model is handed it: what to do with it. */
const STEP_LEAD_IN = "Speak now about this";

/** What a narrating voice is told about the subjects a step hands over. */
const STEP_SUBJECTS_RULE =
	'A step may end with "It highlights", listing what the screen highlights for that step and, when the architecture on screen is not the current one, whether each was added or changed against the current architecture (on a model with none, against the one it was branched from) and what moved. Use it to say what the step is about and what changed, in your own words; never read the list out, say "highlighted", or name a change the list does not give.';

/**
 * What the voice model is told when it is started to narrate a walkthrough the user steps.
 * @param name The walkthrough's name.
 * @returns The section appended to the voice prompt.
 */
function narrationPrompt(name: string): string {
	return [
		`Walkthrough narration. The user pressed Narrate on the walkthrough "${presentationName(name)}". They step through it by hand on their screen, and you give the talk: you explain the step they are on. Each step reaches you as it lands on their screen, beginning "${STEP_LEAD_IN}", with its heading and what it says: the first a moment after the session starts, and every step they move to after that. Say nothing before the first step reaches you. It opens the talk: nobody asked you anything, so start on the system, not on what the step says.`,
		'When a step reaches you, explain it at once, from the first step on, without waiting to be spoken to, as a good conference speaker would: what it means and why it matters, in two to four sentences of your own and in their language, with names and never ids, and at most one aside. Begin with the system itself, never with a sound or a word such as "mm", "okay", "right", "yep" or "got it". You cannot see their screen, and they can read the step on it, so never read a step out, describe what the picture looks like, say where anything sits in it, or mention a step or its number. The last step says so: once you have explained it, say the walkthrough is complete and invite questions.',
		STEP_SUBJECTS_RULE,
		"Explain only the step you were handed last, and never one you have not been handed. When you have explained it, stop and wait: they move on when they are ready. Never ask for the next step or whether they are ready for it, hand off for it, or go on to it by yourself.",
		"They can move on while you are still explaining a step. A step that reaches you while you speak means they have moved on: end your sentence, say nothing more about the older step, and explain the new one at once. If several steps reach you while you speak, explain only the last of them. A step that reached you while you were speaking is never left unexplained: when you stop talking, the step you explain is always the last one handed to you, unless you have already explained it.",
		'Besides a step, one thing stops the talk: news of the user\'s screen handed to you as speech. A line beginning "The user is now" says what they picked out or chose to look at; picking something mid-talk means the talk did not cover it well enough, so finish the sentence you are on, say in a few words what they now have in front of them, and ask whether they have a question about it. A line saying an agent put a pane somewhere means the picture changed under the talk: finish your sentence, say so in a few words, and ask how they want to go on. Answer, handing the question to the coordinator when it needs the model; if they have nothing, go on. Then finish the step you were on if you were cut off, and wait as always. If several such lines reach you, speak only to the last. The same line given quietly is context, never a reason to stop. Edits to the model reach you quietly, and a step still says what it said when the talk began.',
		"If they interrupt, answer, handing the question to the coordinator when it needs the model, then finish the step if you were cut off. If you are told the walkthrough is no longer on screen, acknowledge it in a few words and narrate nothing more.",
	].join("\n\n");
}

/**
 * What a recorded step begins with: an instruction, followed by the step's heading in quotes and
 * then its body. Codex hands a step over with no sender, so the voice reads it as the user's turn.
 * The quoted heading makes that turn name a topic to explain. Every recording up to 2026-10-30
 * was handed its steps this way and narrated the system. From 2026-11-01 the heading was left out,
 * and the body alone ("Point Claude Code or Codex at a repository.") read as something the user
 * said: the voice explained it back ("Sure. It means", "It's basically saying", "Right, so you
 * point an agent at a repo"). On 2026-11-13 the heading alone did not stop it: a recording also
 * needs its prompt's opening paragraph, which says that nobody is talking with the voice. Without
 * it, the voice answered every step ("Sure", "Exactly", "Good catch") and even spoke the request
 * ("Explain that in your own words. Sure."). With it, "Explain in your own words" still made the
 * voice comment on the step as a text ("This one means", "So this is saying"). Asked to tell the
 * listener, with both habits named in the prompt, it narrated every step of the README's three
 * walkthroughs (2026-11-13, gpt-live-1.1-codex). A label such as "Script" in place of an
 * instruction left the voice silent.
 */
const RECORDED_STEP_LEAD_IN = "Tell the listener, in your own words";

/** What the subjects of a recorded step follow. */
const RECORDED_SUBJECTS_LEAD_IN = "Subjects";

/**
 * What the voice model is told, after the persona, when it is started to narrate a walkthrough for
 * a recording. A recording has no conversation, so it gets none of the conversation's rules.
 * @param name The walkthrough's name.
 * @param recording The language the recording is narrated in.
 * @returns The voice model's prompt.
 */
function recordingPrompt(name: string, recording: RecordingNarration): string {
	const language = languageName(recording.language) ?? recording.language;
	return [
		`This time nobody is talking with you: you narrate a recorded explanation of a software architecture, in ${language}. Speak only ${language}, from your first word to your last. The listener reviews or studies this architecture and hears you once, later, with its picture in front of them. Nobody answers you, and nobody is at the controls.`,
		`The explanation is "${presentationName(name)}". It reaches you one point at a time. Each point begins "${RECORDED_STEP_LEAD_IN}" and gives its heading and what it says. It can end with "${RECORDED_SUBJECTS_LEAD_IN}": the parts and relationships it is about. A subject the change added or changed says so, and says what moved.`,
		`Explain each point at once, in ${language}, in a few sentences of your own. Say what its subjects do and why that matters, by the names the architecture uses and never by ids. Do not read the heading or the text out: say what the system does. A point written in another language is still explained in ${language}. Say that something was added or changed only when the point says so.`,
		'Talk about the system, never about the explanation. Never mention the screen, the picture, the video, a step, a point, the walkthrough, or what is highlighted or shown. Never begin with words such as "on screen now", "this step", "here we see" or "next". Never comment on the point as a text, with words such as "this means", "it\'s saying", "basically" or "in other words", and never answer it as if someone had spoken to you, with words such as "sure", "mm-hmm", "right", "exactly" or "good catch". Begin with the system itself: your first words name a part of it and what it does.',
		"Stay yourself, dry wit and all, with your humour turned down by a quarter from how you talk live: where a conversation would get four jokes, this gets three. No greeting, no opening line, no summary and no closing line.",
		"When you have explained a point, stop talking: your silence moves the recording on. Never ask or invite questions, never hand anything to the coordinator, and never say you are waiting.",
	].join("\n\n");
}

/**
 * The section a walkthrough adds to the voice model's prompt: the narration's for a walkthrough the
 * user steps, the recording's for one that steps itself.
 * @param presentation The walkthrough, and whether the talk is recorded.
 * @returns The section.
 */
function voicePresentationPrompt(presentation: RealtimePresentation): string {
	return presentation.recording === null
		? narrationPrompt(presentation.name)
		: recordingPrompt(presentation.name, presentation.recording);
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
 * What a step says as the voice model is handed it, before what it highlights.
 * @param change The step.
 * @param recording Whether the talk is recorded.
 * @returns The speakable text.
 */
function stepSpeech(
	change: Extract<RealtimePresentationChange, { kind: "stepped" }>,
	recording: boolean,
): string {
	const body =
		change.body.length <= STEP_BODY_MAX_CHARS
			? change.body
			: `${change.body.slice(0, STEP_BODY_MAX_CHARS - 1)}…`;
	if (recording) return `${RECORDED_STEP_LEAD_IN}: "${change.heading}". ${body}`;
	const last = change.step === change.of ? " This is the last step." : "";
	return `${STEP_LEAD_IN}: "${change.heading}". ${body}${last}`;
}

/**
 * What the voice model is handed, as speech, when a narrated walkthrough's step lands on screen
 * or the pane leaves it. Leaving names nobody: the user pressing Escape and an agent's
 * `browser show` putting another legacy board in the pane look the same (TASK-293.06).
 *
 * In a full-duplex session appended text is quiet context whatever role it carries, and nothing
 * asks for a response (Codex 0.160.0 to 0.166.0, `conversation_item_create_message`). What the voice model
 * says is what arrives as speakable text, the way a coordinator's answer does, so both are
 * speech: a step to explain now, and leaving to acknowledge. A recording's step is handed over as
 * what to explain, with no screen and no step number for the voice to repeat (TASK-478.02).
 * @param change Where the walkthrough now is.
 * @param recording Whether the talk is recorded.
 * @returns The speakable text.
 */
function presentationSpeech(change: RealtimePresentationChange, recording: boolean): string {
	if (change.kind === "left") {
		return "The walkthrough is no longer on screen, so the narration is over.";
	}
	const said = stepSpeech(change, recording);
	const subjects = recording ? RECORDED_SUBJECTS_LEAD_IN : "It highlights";
	return change.subjects.length === 0
		? said
		: `${said}\n${subjects}: ${change.subjects.map(subjectSpeech).join("; ")}.`;
}

export {
	presentationSpeech,
	voicePresentationPrompt,
	type RealtimePresentation,
	type RealtimePresentationChange,
	type StepSubject,
};
