// How a recording receives the voice: with more of it buffered than a conversation can afford,
// and counted, so the talk says whether the voice arrived whole.
//
// The voice is a WebRTC track. Its packets come unevenly at the start of each sentence, and the
// browser's conversational buffer then runs dry: it makes up sound or stretches what it has,
// which a listener hears as a call with bad reception. Nobody talks back to a recording, so it
// trades latency for an unbroken voice (`RECORDING_MS.voiceBuffer`).

import { RECORDING_MS } from "@archboard/timing";
import type { Talk } from "@archboard/walkthrough/talk";
import type { BrowserWorkbenchMediaOwnerOptions } from "#ui/state/application/pane-handles.ts";

/** The voice's receivers, as the media owner hands them over. */
type Receivers = Parameters<NonNullable<BrowserWorkbenchMediaOwnerOptions["receivers"]>>[0];

/** How the voice arrived. */
type Reception = NonNullable<Talk["audio"]["reception"]>;

/**
 * Buffer the voice for a recording.
 * @param receivers The voice's receivers.
 * @returns The browser receivers among them, to count later.
 */
function bufferVoice(receivers: Receivers): readonly RTCRtpReceiver[] {
	const browser = receivers.filter((receiver) => receiver instanceof RTCRtpReceiver);
	for (const receiver of browser) receiver.jitterBufferTarget = RECORDING_MS.voiceBuffer;
	return browser;
}

/**
 * How one receiver's statistic counts the voice, when it is the voice's inbound audio.
 * @param stats One statistic of a receiver's report.
 * @returns The samples made up and stretched, or null for any other statistic.
 */
function countOf(stats: Partial<RTCInboundRtpStreamStats>): Reception | null {
	if (stats.type !== "inbound-rtp" || stats.kind !== "audio") return null;
	return {
		concealedSamples: stats.concealedSamples ?? 0,
		stretchedSamples:
			(stats.insertedSamplesForDeceleration ?? 0) + (stats.removedSamplesForAcceleration ?? 0),
	};
}

/**
 * How the voice arrived through its receivers, all along.
 * @param receivers The receivers.
 * @returns The samples made up and stretched, or undefined when the browser counts none.
 */
async function receptionOf(receivers: readonly RTCRtpReceiver[]): Promise<Reception | undefined> {
	const reports = await Promise.all(receivers.map(async (receiver) => receiver.getStats()));
	const counts = reports.flatMap((report) =>
		[...(report.values() as Iterable<Partial<RTCInboundRtpStreamStats>>)].flatMap(
			(stats) => countOf(stats) ?? [],
		),
	);
	if (counts.length === 0) return undefined;
	return {
		concealedSamples: counts.reduce((sum, count) => sum + count.concealedSamples, 0),
		stretchedSamples: counts.reduce((sum, count) => sum + count.stretchedSamples, 0),
	};
}

export { bufferVoice, receptionOf };
