// The page capturing itself: its own tab's picture and the voice, into one
// file (TASK-304).
//
// The picture comes from the tab, captured with the browser's own screen
// capture: a recording page shows nothing but the pane, so the whole tab is
// the frame. The sound does not: the page plays the voice to nobody (its audio
// element is muted, so a recording is never heard through the speakers), and
// the voice is mixed in from its stream instead. The mix is one Web Audio destination whose track is in the file
// from its first frame, silent until the voice is heard, because a
// MediaRecorder cannot take a track that arrives after it started.
//
// The browser writes the container itself (MP4 with H.264 or WebM with VP9),
// so no encoder runs outside it.

import { RECORDING_CAPTURE_BAR_MS } from "@/shared/timing/timing";
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

/**
 * Bits per second of picture, at most: a 1080p diagram of thin lines, small text and faint veils
 * stays free of blocking. The picture is still most of the time, so a file is far below this.
 */
const VIDEO_BITS_PER_SECOND = 16_000_000;

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
 * What this tab is captured with: exactly the page's own size, since without a size the browser
 * picks one of its own (1920x1024 for a 1920x1080 tab on Chromium 153), and no frame rate
 * (TASK-378). Chromium captures a tab at 30 frames a second unless asked otherwise, and a rate
 * asked for also caps the track: it drops a frame whenever the frames before it ran slightly
 * ahead of that rate, which left a picture held for two frames a few times a recording.
 * @param width The page's width, in CSS pixels.
 * @param height The page's height, in CSS pixels.
 * @param scale Device pixels per CSS pixel.
 * @returns The options.
 */
function tabCaptureOptions(width: number, height: number, scale: number): TabCaptureOptions {
	return {
		video: {
			width: { ideal: Math.round(width * scale) },
			height: { ideal: Math.round(height * scale) },
		},
		audio: false,
		preferCurrentTab: true,
	};
}

/**
 * This tab's picture, from the browser's screen capture.
 * @returns The video track.
 * @throws {Error} When the browser captured something other than this tab, or nothing.
 */
async function tabVideo(): Promise<MediaStreamTrack> {
	const options = tabCaptureOptions(window.innerWidth, window.innerHeight, window.devicePixelRatio);
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
 * Wait for the bar the browser draws above a captured tab, which takes room from the page: the
 * page resizes once it is drawn. Bounded, since a browser may draw none.
 * @param width The page's width before capture.
 * @param height The page's height before capture.
 * @returns When the page has changed size, or the bound has passed.
 */
function sharingBarDrawn(width: number, height: number): Promise<void> {
	return new Promise((resolve) => {
		/** The bar is drawn, or will not be: stop waiting. */
		const done = (): void => {
			window.removeEventListener("resize", changed);
			clearTimeout(timer);
			resolve();
		};
		/** The page resized: done once it is no longer the size it was. */
		const changed = (): void => {
			if (window.innerWidth !== width || window.innerHeight !== height) done();
		};
		const timer = setTimeout(done, RECORDING_CAPTURE_BAR_MS);
		window.addEventListener("resize", changed);
		changed();
	});
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
 * Capture this tab into a file. Called from a user gesture: capturing a tab needs one. Resolves
 * once the browser has drawn the bar that says the tab is shared, so whoever keeps the page its
 * size can give the room back before anything is written.
 * @param container The container to write.
 * @returns The capture, not yet writing.
 */
async function captureTab(container: RecordingContainer): Promise<TabCapture> {
	const mimeType = mediaTypeFor(container);
	const { innerWidth: width, innerHeight: height } = window;
	const video = await tabVideo();
	await sharingBarDrawn(width, height);
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
		// No timeslice: the whole file is handed over once, when it stops, and nothing reads it before.
		recorder.start();
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

export { captureTab, tabCaptureOptions, type CapturedFile, type TabCapture };
