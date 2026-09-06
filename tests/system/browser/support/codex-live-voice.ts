import { writeFileSync } from "node:fs";

import { pollUntil } from "./agent-browser.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

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
