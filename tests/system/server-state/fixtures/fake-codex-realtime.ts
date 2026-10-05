// What the production fixture says for a realtime voice session.
//
// By default a session speaks one scripted exchange as soon as it starts, which is what the live
// voice owner reads. A test that needs the voice to speak again later raises `speaks` in the
// control file, and every live session says the scripted line once more. A fixture told to
// narrate (`{ "narrates": true }` in its control file) is the recording's voice instead: it says
// nothing until a step is handed to it with appendSpeech, then explains it in one line spoken a
// word at a time, as a real session's transcript arrives, and answers a real browser's WebRTC
// offer with an answer that browser accepts.

import { readFileSync } from "node:fs";

type Notify = (method: string, params: unknown) => void;

/** How many times the live sessions have been asked to speak again. */
let spokenAgain = 0;

/**
 * Whether the fixture is a recording's voice, which speaks only about steps it is handed.
 * @param controlPath The fixture's control file.
 * @returns True when the control file says it narrates.
 */
function narrating(controlPath: string): boolean {
	return (
		(JSON.parse(readFileSync(controlPath, "utf8")) as { narrates?: boolean }).narrates === true
	);
}

/** How long apart the words of the scripted exchange arrive, in milliseconds. */
const SCRIPTED_WORD_MS = 300;

/** How long apart the words of a narrated step arrive: brisker, so a recording stays short. */
const NARRATED_WORD_MS = 120;

/** What the voice model says in the scripted exchange. */
const SCRIPTED_LINE = "The controlled voice context is visible.";

/**
 * An answer a real browser accepts for its offer, which nobody will ever connect to: the offer's
 * own media sections, answered actively with made-up ICE credentials and fingerprint. ICE stays
 * new, so the session is negotiated and silent, which is all a recording's page needs.
 * @param offer The browser's offer.
 * @returns The answer, or a placeholder when the offer is not SDP (a test that fakes the peer).
 */
function answerFor(offer: unknown): string {
	if (typeof offer !== "string" || !offer.includes("m="))
		return "v=0\r\ns=controlled-answer-sdp\r\n";
	const fingerprint = Array.from({ length: 32 }, (_, index) =>
		((index * 37 + 11) % 256).toString(16).padStart(2, "0").toUpperCase(),
	).join(":");
	const dropped = ["a=ice-options", "a=extmap-allow-mixed", "a=msid", "a=ssrc"];
	const lines = offer
		.split("\r\n")
		.filter((line) => line !== "" && !dropped.some((prefix) => line.startsWith(prefix)))
		.map((line) => {
			if (line.startsWith("a=ice-ufrag:")) return "a=ice-ufrag:fake";
			if (line.startsWith("a=ice-pwd:")) return "a=ice-pwd:fakepasswordfakepassword12";
			if (line.startsWith("a=fingerprint:")) return `a=fingerprint:sha-256 ${fingerprint}`;
			if (line.startsWith("a=setup:")) return "a=setup:active";
			return line;
		});
	return `${lines.join("\r\n")}\r\n`;
}

/**
 * Speak one line, a word at a time, then end the turn.
 * @param notify Sends a notification.
 * @param session The session and thread it belongs to.
 * @param session.threadId The coordinator thread.
 * @param session.realtimeSessionId The realtime session.
 * @param id The line's item id.
 * @param text What is said.
 * @param wordMs How long apart its words arrive.
 */
function speak(
	notify: Notify,
	session: { readonly threadId: unknown; readonly realtimeSessionId: string | null },
	id: string,
	text: string,
	wordMs: number,
): void {
	const { threadId, realtimeSessionId } = session;
	const item = { id, realtimeSessionId, type: "transcriptSegment", role: "assistant", text };
	notify("thread/realtime/item/started", { threadId, item: { ...item, text: "" } });
	const words = text.split(" ");
	for (const [index, word] of words.entries()) {
		setTimeout(
			() => {
				notify("thread/realtime/item/transcript/delta", {
					threadId,
					itemId: id,
					delta: index === 0 ? word : ` ${word}`,
				});
				if (index === words.length - 1)
					notify("thread/realtime/item/completed", { threadId, item });
			},
			wordMs * (index + 1),
		);
	}
}

/**
 * Start a session: negotiate, and speak the scripted exchange unless the fixture narrates.
 * @param notify Sends a notification.
 * @param params The start's parameters.
 * @param narrates Whether the fixture is a recording's voice.
 */
function startRealtime(notify: Notify, params: Record<string, unknown>, narrates: boolean): void {
	const threadId = params["threadId"];
	const realtimeSessionId = String(params["realtimeSessionId"]);
	const transport = params["transport"] as { sdp?: unknown } | undefined;
	notify("thread/realtime/sdp", { threadId, sdp: answerFor(transport?.sdp) });
	notify("thread/realtime/started", { threadId, realtimeSessionId, version: "v3" });
	if (narrates) return;
	const user = {
		id: "controlled-user-transcript",
		realtimeSessionId,
		type: "transcriptSegment",
		role: "user",
		text: "Show the controlled voice context.",
	};
	notify("thread/realtime/item/started", { threadId, item: user });
	notify("thread/realtime/item/completed", { threadId, item: user });
	// The voice model's words arrive one delta at a time, as the real session's do.
	speak(
		notify,
		{ threadId, realtimeSessionId },
		"controlled-assistant-transcript",
		SCRIPTED_LINE,
		SCRIPTED_WORD_MS,
	);
}

/**
 * Say the scripted line once more on every live session, each time a test raises `speaks` in the
 * control file.
 * @param notify Sends a notification.
 * @param sessions The realtime session of each thread that carries one.
 * @param speaks How many times a test has asked in all, as the control file says.
 */
function speakAgain(
	notify: Notify,
	sessions: ReadonlyMap<string, string>,
	speaks: number | undefined,
): void {
	if (speaks === undefined || speaks <= spokenAgain) return;
	spokenAgain = speaks;
	for (const [threadId, realtimeSessionId] of sessions) {
		speak(
			notify,
			{ threadId, realtimeSessionId },
			`controlled-assistant-transcript-${speaks}`,
			SCRIPTED_LINE,
			SCRIPTED_WORD_MS,
		);
	}
}

/**
 * Explain a step handed over as speech, when the fixture narrates.
 * @param notify Sends a notification.
 * @param params The append's parameters.
 * @param realtimeSessionId The live session.
 * @param sequence Which append this is, for the line's id.
 */
function explainStep(
	notify: Notify,
	params: Record<string, unknown>,
	realtimeSessionId: string | null,
	sequence: number,
): void {
	const heading = /"([^"]+)"/u.exec(String(params["text"]))?.[1] ?? "this step";
	speak(
		notify,
		{ threadId: params["threadId"], realtimeSessionId },
		`narrated-step-${sequence}`,
		`Here the picture shows ${heading}, and why it matters.`,
		NARRATED_WORD_MS,
	);
}

export { explainStep, narrating, speakAgain, startRealtime };
