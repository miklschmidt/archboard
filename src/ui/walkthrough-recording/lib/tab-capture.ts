// The page capturing itself: its own tab's picture and the voice, into one
// file (TASK-304).
//
// The picture comes from the tab, captured with the browser's own screen
// capture: a recording page shows nothing but the pane, so the whole tab is
// the frame. The sound does not: a headless browser plays to no device, so a
// tab's own audio is silence, and the voice is mixed in from its stream
// instead. The mix is one Web Audio destination whose track is in the file
// from its first frame, silent until the voice is heard, because a
// MediaRecorder cannot take a track that arrives after it started.
//
// The browser writes the container itself (MP4 with H.264 or WebM with VP9),
// so no encoder runs outside it.

import type { RecordingContainer } from "@/shared/walkthrough-recording";

/** The media types each container is written with, best first. */
const MEDIA_TYPES: Readonly<Record<RecordingContainer, readonly string[]>> = {
	mp4: [
		"video/mp4;codecs=avc1.640028,mp4a.40.2",
		"video/mp4;codecs=avc1,mp4a.40.2",
		"video/mp4;codecs=avc1,opus",
		"video/mp4",
	],
	webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
};

/** Frames per second the tab is captured at: smooth camera glides, at a cost a CPU can pay. */
const FRAME_RATE = 30;

/** Bits per second of picture: a 1080p diagram with thin lines and small text stays sharp. */
const VIDEO_BITS_PER_SECOND = 8_000_000;

/** How much the recorder hands over at a time, in milliseconds of recording. */
const CHUNK_MS = 1000;

/**
 * What capturing this tab is asked with. Chrome's `preferCurrentTab` (Chrome 94) is not in the
 * DOM library this builds against, so it is added here and nowhere else.
 */
type TabCaptureOptions = DisplayMediaStreamOptions & { readonly preferCurrentTab: true };

/** A finished recording. */
interface CapturedFile {
	readonly blob: Blob;
	/** The media type it is written in. */
	readonly mimeType: string;
	readonly durationMs: number;
}

/** The tab being captured, and the file it goes into. */
interface TabCapture {
	/** The media type the file is written in. */
	readonly mimeType: string;
	/**
	 * Mix a voice into the file's sound. The same stream twice is heard once.
	 * @param stream The voice.
	 */
	readonly hear: (stream: MediaStream) => void;
	/** Begin writing. */
	readonly begin: () => void;
	/**
	 * Stop writing and hand the file over.
	 * @returns The file and how long it runs.
	 */
	readonly finish: () => Promise<CapturedFile>;
	/** Stop, keeping nothing. */
	readonly discard: () => void;
}

/**
 * The media type a container is written in here.
 * @param container The container asked for.
 * @returns The first media type this browser records.
 * @throws {Error} When this browser records that container in none of them.
 */
function mediaTypeFor(container: RecordingContainer): string {
	const type = MEDIA_TYPES[container].find((candidate) => MediaRecorder.isTypeSupported(candidate));
	if (type === undefined) {
		const other = container === "mp4" ? "webm" : "mp4";
		throw new Error(`This browser cannot record ${container}. Record to a .${other} file instead.`);
	}
	return type;
}

/**
 * This tab's picture, from the browser's screen capture.
 * @returns The video track.
 * @throws {Error} When the browser captured something other than this tab, or nothing.
 */
async function tabVideo(): Promise<MediaStreamTrack> {
	const options: TabCaptureOptions = {
		video: { frameRate: FRAME_RATE },
		audio: false,
		preferCurrentTab: true,
	};
	const stream = await navigator.mediaDevices.getDisplayMedia(options);
	const [track] = stream.getVideoTracks();
	if (track === undefined) {
		throw new Error("The browser's capture of this tab carried no picture.");
	}
	if (track.getSettings().displaySurface !== "browser") {
		track.stop();
		throw new Error(
			"The browser captured the screen rather than this tab. Start Chromium with --auto-accept-this-tab-capture and without --use-fake-ui-for-media-stream.",
		);
	}
	return track;
}

/**
 * Wait for a recorder to stop.
 * @param recorder The recorder.
 * @returns When it has stopped and handed over its last chunk.
 */
function stopped(recorder: MediaRecorder): Promise<void> {
	return new Promise((resolve) => {
		recorder.addEventListener("stop", () => resolve(), { once: true });
		recorder.stop();
	});
}

/**
 * Capture this tab into a file. Called from a user gesture: capturing a tab needs one.
 * @param container The container to write.
 * @returns The capture, not yet writing.
 */
async function captureTab(container: RecordingContainer): Promise<TabCapture> {
	const mimeType = mediaTypeFor(container);
	const video = await tabVideo();
	const audio = new AudioContext();
	const mix = audio.createMediaStreamDestination();
	const heard = new Map<string, MediaStreamAudioSourceNode>();
	const recorder = new MediaRecorder(new MediaStream([video, ...mix.stream.getAudioTracks()]), {
		mimeType,
		videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
	});
	const chunks: Blob[] = [];
	recorder.addEventListener("dataavailable", (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	});
	let startedAt: number | null = null;

	/** Let go of the tab and the sound. */
	function release(): void {
		video.stop();
		for (const source of heard.values()) source.disconnect();
		heard.clear();
		void audio.close();
	}

	/**
	 * Mix a voice into the file's sound, once.
	 * @param stream The voice.
	 */
	function hear(stream: MediaStream): void {
		if (heard.has(stream.id) || stream.getAudioTracks().length === 0) return;
		const source = audio.createMediaStreamSource(stream);
		source.connect(mix);
		heard.set(stream.id, source);
	}

	/** Begin writing. */
	function begin(): void {
		if (recorder.state !== "inactive") return;
		void audio.resume();
		recorder.start(CHUNK_MS);
		startedAt = performance.now();
	}

	/**
	 * Stop writing and hand the file over.
	 * @returns The file and how long it runs.
	 */
	async function finish(): Promise<CapturedFile> {
		const began = startedAt ?? performance.now();
		if (recorder.state !== "inactive") await stopped(recorder);
		const durationMs = performance.now() - began;
		release();
		return { blob: new Blob(chunks, { type: mimeType }), mimeType, durationMs };
	}

	/** Stop, keeping nothing. */
	function discard(): void {
		if (recorder.state !== "inactive") recorder.stop();
		chunks.length = 0;
		release();
	}

	return { mimeType, hear, begin, finish, discard };
}

export { captureTab, type CapturedFile, type TabCapture };
