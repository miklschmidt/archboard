// Starting voice to present one walkthrough as a talk (TASK-251).
//
// The voice model never sees a tool call or its result, only coordinator prose,
// so a step cannot reach it as data. The loop is therefore paced by the voice
// model and carried by the coordinator: the voice asks for a step, the
// coordinator presents it in the pane and hands the step back as prose once it
// is on screen, the voice explains it, and asks for the next only when it has
// finished. A person interrupting simply delays that next request.
//
// Two models read two different texts. The voice model's prompt gains the
// walkthrough as an outline and how to pace the talk; the coordinator's start
// instructions gain what to do with each request. Both are written here, beside
// each other, because they are the two halves of one loop.

/** How much of a walkthrough's name a start carries, in characters. */
const PRESENTATION_NAME_MAX_CHARS = 200;

/**
 * The walkthrough a voice session was started to present, as the start carries it: which one,
 * and what to call it. Nothing of what it says.
 *
 * The words of a step reach the voice model only from the coordinator, after the pane has moved
 * to it, and the hand-over says which step of how many it is. A start that carried the steps, or
 * even their headings, let the voice model go on without the picture: in the first narrated
 * session it explained step 2 from its own copy while the pane was still on step 1.
 */
interface RealtimePresentation {
	/** The walkthrough's id. */
	readonly walkthrough: string;
	/** Its name, so the voice model can say what it is about to present. */
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
		`Walkthrough presentation mode. The person pressed Narrate: present the walkthrough "${presentationName(name)}" as a talk, one step at a time, while their pane shows each step. You pace it from start to finish. You are not given the steps in advance: each one reaches you from the coordinator once it is on their screen, and says which step of how many it is.`,
		"Begin at once, without waiting for them to speak: one short sentence naming the walkthrough, then hand off to the coordinator, which knows which step comes next.",
		"Never explain a step you have not been handed, and if you are handed a different step than you expected, explain the one you were handed: it is what they are looking at. While you wait, stay quiet or say a few words at most.",
		"Explain each step as a presenter would: what it shows and why it matters, in your own words and their language, with names and never ids. Say the step's number and the total exactly as they were handed to you; never count the steps yourself or guess how many there are.",
		"The moment you finish a step that is not the last, hand off for the next one in that same turn. Do not ask whether there are questions and do not wait for them to say anything: they can interrupt whenever they like, and silence means go on.",
		"If they interrupt, answer first, handing the question to the coordinator when it needs the board; then go on by yourself, finishing the step if you were cut off.",
		"If you are told they moved the presentation by hand, explain that step and carry on from it. If you are told they left, stop presenting and say so briefly. If a step could not be presented, say what the coordinator reported. After the last step, say the walkthrough is complete and invite questions.",
	].join("\n\n");
}

/**
 * What the coordinator is told when voice is started to present a walkthrough.
 * @param name The walkthrough's name.
 * @returns The section appended to the coordinator's realtime start instructions.
 */
function coordinatorPresentationInstructions(name: string): string {
	return [
		`Walkthrough presentation mode. The voice model is presenting the walkthrough "${presentationName(name)}" to the person as a talk and paces it: it asks you to present a step, explains the step aloud, and asks for the next when it has finished. The person is listening to silence while you work, so a request to present a step is answered as fast as you can.`,
		"Every request you receive in this mode is a request to present the next step unless its transcript shows the person asking for something else. A request arrives carrying the person's last words, never words the voice model chose, so until the person speaks it repeats their opening request: to be given the talk one step at a time, moving on to the next step after each. That is what it means every time it arrives; never take it as a reason to present step 1 again, and read the transcript beside it for anything the person has asked since. Call the present_step tool as your very first action with no arguments: the host knows which step comes next, including after the person moved by hand. Pass a step number only when the person asked for a particular step. This overrides every instruction to prepare first: do not read a skill, run a command, consult a task tracker, inspect a board or write a preamble message before calling it. The walkthrough is already known to the host, and the pane, board and variant are the host's. The tool answers only once the step has finished arriving on the person's screen.",
		'Then reply at once with the step for the voice model to say, as one [FINAL] message holding one short speakable paragraph: after the header, begin with "Step N of M" and the heading, then the meaning of the body in plain prose, naming subjects by name and never by id, and naming the view when the step is read through one. No markdown, lists, JSON or tool syntax, and well under the backend message budget. Do nothing else in that turn.',
		"If present_step is refused, do not describe the step. Tell the voice model plainly what the refusal says, such as the person stepping by hand or the pane having closed.",
		"A developer message may tell you the person moved the presentation by hand or left it. Follow the picture: the next step asked for continues from where the person is, and nothing is presented after they leave unless they ask again.",
		"Questions between steps are ordinary requests: answer them from the board as you normally would, and do not present a step unless the voice model asks for one.",
	].join("\n");
}

/** What a person did to a presented walkthrough by hand. */
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

/** How much of a step's body a by-hand change carries to the voice model, in characters. */
const CHANGE_BODY_MAX_CHARS = 1_500;

/** How the voice model is told something mid-session. */
type VoiceDelivery =
	/** Speakable text, which the voice model says: the path a coordinator's answer takes. */
	| { readonly via: "speech"; readonly text: string }
	/** Quiet context, which it may use and does not answer. */
	| { readonly via: "context"; readonly text: string };

/**
 * What both models are told when a person moves a presentation by hand, or leaves it.
 *
 * In a full-duplex (V3) session text appended to the voice model is quiet context whatever role
 * it carries: nothing asks for a response (Codex 0.155.1, `conversation_item_create_message`).
 * What the model says is what arrives as speakable text, the way a coordinator's answer does. So
 * a step the person chose is handed to the voice model as speech, in the words the coordinator
 * uses for a step it presented, and it explains that step now; leaving is quiet context, because
 * the right response to somebody leaving is to stop.
 * @param change What the person did.
 * @returns The coordinator's developer text, and what the voice model is given and how.
 */
function presentationChangeTexts(change: RealtimePresentationChange): {
	readonly coordinator: string;
	readonly voice: VoiceDelivery;
} {
	if (change.kind === "left") {
		const text =
			"The person left the walkthrough presentation (data). Stop presenting: no further step is asked for or presented unless the person asks again.";
		return { coordinator: text, voice: { via: "context", text } };
	}
	const where = `step ${change.step} of ${change.of}, "${change.heading}"`;
	const body =
		change.body.length <= CHANGE_BODY_MAX_CHARS
			? change.body
			: `${change.body.slice(0, CHANGE_BODY_MAX_CHARS - 1)}…`;
	return {
		coordinator: `The person moved the walkthrough presentation by hand to ${where} (data). That step is on their screen now; the narration continues from it.`,
		voice: {
			via: "speech",
			text: `The person moved the presentation by hand, and this is on their screen now. Step ${change.step} of ${change.of}, ${change.heading}. ${body}`,
		},
	};
}

export {
	presentationChangeTexts,
	type VoiceDelivery,
	type RealtimePresentationChange,
	coordinatorPresentationInstructions,
	voicePresentationPrompt,
	type RealtimePresentation,
};
