// Where a recording page hears the voice (TASK-304).
//
// The voice arrives as a WebRTC track that the media owner plays through a
// hidden audio element it asks a port for. A recording page hands it a port
// that makes the same element and passes the stream to the recording as soon
// as it plays, so the voice is in the file without anybody reaching into the
// document for it.

import { browserAudioElements, type BrowserAudioElementPort } from "@/ui/codex-workbench-media";

/**
 * The media owner's audio elements, each passing the voice it plays to a recording.
 * @param hear Takes the voice's stream.
 * @returns The port.
 */
function recordingAudioElements(hear: (stream: MediaStream) => void): BrowserAudioElementPort {
	const plain = browserAudioElements();
	return Object.freeze({
		/**
		 * A hidden, autoplaying audio element, whose stream the recording hears once it plays.
		 * @returns The element.
		 */
		create: () => {
			const element = plain.create();
			element.addEventListener("playing", () => {
				const stream = element.srcObject;
				if (stream instanceof MediaStream) hear(stream);
			});
			return element;
		},
	});
}

export { recordingAudioElements };
