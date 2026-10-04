import { readFileSync, renameSync, writeFileSync } from "node:fs";

import type { ProductionFixture } from "../../server-state/support/codex-production.ts";
import { pollUntil } from "./agent-browser.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";
import { productionFixtureRecords } from "./codex-workbench-production.ts";

interface ControlledVoiceMediaAudit {
	readonly localTracks: readonly { readonly enabled: boolean; readonly stopCount: number }[];
	readonly remoteTracks: readonly { readonly stopCount: number }[];
	readonly peers: readonly { readonly closeCount: number; readonly connectionState: string }[];
	readonly contexts: readonly { readonly closeCount: number; readonly state: string }[];
	readonly attachedAudioElements: number;
	readonly playCount: number;
}
type BrowserOperator = Readonly<Pick<AgentBrowserSession, "eval" | "run">>;

const CONTROLLED_MEDIA_SOURCE = String.raw`
(() => {
	if (globalThis.__archboardControlledVoiceMedia) return;
	const audit = {
		localTracks: [],
		remoteTracks: [],
		peers: [],
		contexts: [],
		playCount: 0,
		outputSilent: false,
	};
	// Native prototypes expose these as getters, so the doubles own plain fields.
	const own = (target, fields) => {
		for (const [key, value] of Object.entries(fields)) {
			Object.defineProperty(target, key, { configurable: true, writable: true, value });
		}
	};
	class ControlledTrack extends EventTarget {
		constructor(kind) {
			super();
			own(this, { kind, enabled: true, readyState: 'live', stopCount: 0 });
		}
		stop() {
			this.stopCount += 1;
			this.readyState = 'ended';
		}
	}
	class ControlledStream extends EventTarget {
		constructor(tracks = []) { super(); own(this, { tracks }); }
		getTracks() { return this.tracks; }
		getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
	}
	class ControlledChannel extends EventTarget {
		constructor() {
			super();
			this.readyState = 'open';
		}
		close() { this.readyState = 'closed'; }
	}
	class ControlledSender {
		constructor(track) { own(this, { track }); }
		replaceTrack(track) {
			this.track = track;
			return Promise.resolve();
		}
	}
	class ControlledPeer extends EventTarget {
		constructor() {
			super();
			this.connectionState = 'new';
			this.iceConnectionState = 'new';
			this.localDescription = null;
			this.closeCount = 0;
			this.senders = [];
			this.channel = new ControlledChannel();
			this.remoteTrack = new ControlledTrack('audio');
			audit.remoteTracks.push(this.remoteTrack);
			audit.peers.push(this);
		}
		addTransceiver(track) {
			this.senders.push(new ControlledSender(track));
			return {};
		}
		createDataChannel() { return this.channel; }
		createOffer() { return Promise.resolve({ type: 'offer', sdp: 'controlled-offer-sdp' }); }
		setLocalDescription(description) {
			this.localDescription = { type: description.type || 'offer', sdp: description.sdp || '' };
			return Promise.resolve();
		}
		setRemoteDescription() { return Promise.resolve(); }
		getSenders() { return this.senders; }
		getReceivers() { return [{ track: this.remoteTrack }]; }
		removeTrack() {}
		close() {
			this.closeCount += 1;
			this.connectionState = 'closed';
		}
	}
	class ControlledNode {
		connect() {}
		disconnect() {}
	}
	class ControlledAnalyser extends ControlledNode {
		constructor() {
			super();
			this.fftSize = 4;
		}
		// Model output: a steady tone unless the test silences the output while the
		// microphone stays live, which is how microphone-only input is told apart.
		getByteTimeDomainData(samples) { samples.set(audit.outputSilent ? [128, 128, 128, 128] : [128, 144, 128, 112]); }
	}
	class ControlledAudioContext {
		constructor() {
			this.state = 'running';
			this.closeCount = 0;
			audit.contexts.push(this);
		}
		resume() {
			this.state = 'running';
			return Promise.resolve();
		}
		createMediaStreamSource() { return new ControlledNode(); }
		createAnalyser() { return new ControlledAnalyser(); }
		close() {
			this.closeCount += 1;
			this.state = 'closed';
			return Promise.resolve();
		}
	}
	// The product narrows every DOM object with instanceof at one seam; the
	// doubles sit on the native prototypes so that seam stays the real one.
	Object.setPrototypeOf(ControlledTrack.prototype, MediaStreamTrack.prototype);
	Object.setPrototypeOf(ControlledStream.prototype, MediaStream.prototype);
	Object.setPrototypeOf(ControlledSender.prototype, RTCRtpSender.prototype);
	const mediaDevices = new EventTarget();
	Object.setPrototypeOf(mediaDevices, MediaDevices.prototype);
	mediaDevices.getUserMedia = () => {
		const track = new ControlledTrack('audio');
		audit.localTracks.push(track);
		return Promise.resolve(new ControlledStream([track]));
	};
	Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
	Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: ControlledStream });
	Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: ControlledPeer });
	Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: ControlledAudioContext });
	Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
		configurable: true,
		get() { return this.__controlledSrcObject || null; },
		set(value) { this.__controlledSrcObject = value; },
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value() {
			audit.playCount += 1;
			return Promise.resolve();
		},
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
		configurable: true,
		value() {},
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'load', {
		configurable: true,
		value() {},
	});
	globalThis.__archboardControlledVoiceMedia = audit;
})();
`;

async function openWithControlledVoiceMedia(
	browser: BrowserOperator,
	url: string,
	initScriptPath: string,
): Promise<void> {
	writeFileSync(initScriptPath, CONTROLLED_MEDIA_SOURCE);
	await browser.run(["--init-script", initScriptPath, "open", url]);
	await pollUntil(
		async () => {
			const installed = await browser.eval<boolean>(
				"Boolean(globalThis.__archboardControlledVoiceMedia)",
			);
			return installed;
		},
		(installed) => installed,
		"the controlled voice media shim to install before the first document",
	);
}

async function readControlledVoiceMediaAudit(
	browser: BrowserOperator,
): Promise<ControlledVoiceMediaAudit> {
	const audit = await browser.eval<ControlledVoiceMediaAudit>(`(() => {
		const audit = globalThis.__archboardControlledVoiceMedia;
		if (!audit) throw new Error('Controlled voice media was not installed.');
		return {
			localTracks: audit.localTracks.map(track => ({ enabled: track.enabled, stopCount: track.stopCount })),
			remoteTracks: audit.remoteTracks.map(track => ({ stopCount: track.stopCount })),
			peers: audit.peers.map(peer => ({ closeCount: peer.closeCount, connectionState: peer.connectionState })),
			contexts: audit.contexts.map(context => ({ closeCount: context.closeCount, state: context.state })),
			attachedAudioElements: document.querySelectorAll('audio[hidden]').length,
			playCount: audit.playCount,
		};
	})()`);
	return audit;
}

export {
	openWithControlledVoiceMedia,
	readControlledVoiceMediaAudit,
	type ControlledVoiceMediaAudit,
};

/**
 * Silence or restore the controlled model output while the microphone track
 * stays live: the wave must follow the model, never the microphone.
 * @param browser The page.
 * @param silent True to make the model output silent.
 */
async function setControlledOutputSilent(browser: BrowserOperator, silent: boolean): Promise<void> {
	await browser.eval<boolean>(
		`(globalThis.__archboardControlledVoiceMedia.outputSilent = ${JSON.stringify(silent)}, true)`,
	);
}

export { setControlledOutputSilent };

/**
 * Have every live voice say the fake's scripted line once more, a word at a time, as a real
 * session's transcript arrives. It waits for the fake to carry a voice session first, since a
 * session that has not started says nothing. The control file is replaced whole, so the fake
 * never reads half of it.
 * @param fixture The fake Codex's files.
 * @returns The item id the line is said under.
 */
async function askToSpeak(fixture: ProductionFixture): Promise<string> {
	await pollUntil(
		() =>
			productionFixtureRecords<FixtureRecord>(fixture).some(
				(record) => record.kind === "notification" && record.method === "thread/realtime/started",
			),
		Boolean,
		"the fake Codex to carry a live voice session",
	);
	const control = JSON.parse(readFileSync(fixture.controlPath, "utf8")) as { speaks?: number };
	const speaks = (control.speaks ?? 0) + 1;
	const next = `${fixture.controlPath}.next`;
	writeFileSync(next, JSON.stringify({ ...control, speaks }));
	renameSync(next, fixture.controlPath);
	return `controlled-assistant-transcript-${speaks}`;
}

/**
 * Whether the fake Codex has said the whole of one line.
 * @param fixture The fake Codex's files.
 * @param itemId The line's item id.
 * @returns True once its last word is out.
 */
function lineSaid(fixture: ProductionFixture, itemId: string): boolean {
	return productionFixtureRecords<FixtureRecord>(fixture).some(
		(record) =>
			record.kind === "notification" &&
			record.method === "thread/realtime/item/completed" &&
			(record.params?.["item"] as { readonly id?: unknown } | undefined)?.id === itemId,
	);
}

export { askToSpeak, lineSaid };

/** The coordinator thread the fixture creates first, at Talk; voice runs on it. */
const RAW_COORDINATOR_THREAD_ID = "thread-1";

/** One line of the fixture's log. */
interface FixtureRecord {
	readonly kind?: string;
	readonly method?: string;
	readonly args?: readonly string[];
	readonly params?: Record<string, unknown>;
	readonly result?: Record<string, unknown>;
}

/** Where Talk's steps fall in the records written after it was pressed; -1 for a missing step. */
interface TalkWire {
	readonly threadStarts: number;
	readonly realtimeStarts: number;
	/** The workhorse thread Talk created after the coordinator. */
	readonly workhorse: string | null;
	/** The coordinator's thread/start. */
	readonly coordinatorAt: number;
	/** The workhorse's thread/start. */
	readonly createdAt: number;
	/** The conversation reading the created thread's turns: it is the tab's linked thread. */
	readonly readAt: number;
	readonly voiceAt: number;
	/** The board catalogue, naming the given board, injected into the coordinator. */
	readonly catalogueAt: number;
}

const isFrame = (record: FixtureRecord, method: string): boolean =>
	record.kind === "frame" && record.method === method;

/**
 * Where Talk's steps fall in the fixture's log.
 * @param talked The records written after Talk was pressed.
 * @param board The board in view, which the coordinator's catalogue must name.
 * @returns The step positions.
 */
function talkWire(talked: readonly FixtureRecord[], board: string): TalkWire {
	const started = talked
		.filter((record) => record.kind === "response" && record.method === "thread/start")
		.map((record) => (record.result?.["thread"] as { id?: string } | undefined)?.id ?? null);
	const workhorse = started.find((id) => id !== RAW_COORDINATOR_THREAD_ID) ?? null;
	const starts = talked.flatMap((record, index) =>
		isFrame(record, "thread/start") ? [index] : [],
	);
	const named = JSON.stringify(JSON.stringify(board)).slice(1, -1);
	return {
		threadStarts: starts.length,
		realtimeStarts: talked.filter((record) => isFrame(record, "thread/realtime/start")).length,
		workhorse,
		coordinatorAt: starts[0] ?? -1,
		createdAt: starts[1] ?? -1,
		readAt: talked.findIndex(
			(record) =>
				isFrame(record, "thread/turns/list") &&
				workhorse !== null &&
				record.params?.["threadId"] === workhorse,
		),
		voiceAt: talked.findIndex((record) => isFrame(record, "thread/realtime/start")),
		catalogueAt: talked.findIndex(
			(record) =>
				isFrame(record, "thread/inject_items") &&
				record.params?.["threadId"] === RAW_COORDINATOR_THREAD_ID &&
				JSON.stringify(record.params["items"]).includes(named),
		),
	};
}

export { RAW_COORDINATOR_THREAD_ID, talkWire, type FixtureRecord, type TalkWire };
