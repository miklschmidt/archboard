// Where a recording page hears the voice (TASK-304).
//
// The voice arrives as a WebRTC track that the media owner plays through a
// hidden audio element it asks a port for. A recording page hands it a port
// that makes the same element and passes the stream to the recording as soon
// as it plays, so the voice is in the file without anybody reaching into the
// document for it.
//
// The element is muted. A recording is made in the background, often by an
// agent finishing a pull request, and nobody should hear it through the
// machine's speakers. The file does not need the element's sound: the
// recording mixes the stream itself, and a muted element still plays it,
// which is what keeps Chrome handing a WebRTC track's sound to Web Audio.

import {
	browserAudioElements,
	type BrowserAudioElementPort,
} from "@archboard/codex-realtime-voice/browser";

/**
 * The media owner's audio elements, each passing the voice it plays to a recording.
 * @param hear Takes the voice's stream.
 * @returns The port.
 */
function recordingAudioElements(hear: (stream: MediaStream) => void): BrowserAudioElementPort {
	const plain = browserAudioElements();
	return Object.freeze({
		/**
		 * A hidden, autoplaying, muted audio element, whose stream the recording hears once it plays.
		 * @returns The element.
		 */
		create: () => {
			const element = plain.create();
			element.muted = true;
			element.addEventListener("playing", () => {
				const stream = element.srcObject;
				if (stream instanceof MediaStream) hear(stream);
			});
			return element;
		},
	});
}

export { recordingAudioElements };
