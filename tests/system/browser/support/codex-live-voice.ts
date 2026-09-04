import { writeFileSync } from "node:fs";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

export interface ControlledVoiceMediaAudit {
	readonly localTracks: readonly { readonly enabled: boolean; readonly stopCount: number }[];
	readonly remoteTracks: readonly { readonly stopCount: number }[];
	readonly peers: readonly { readonly closeCount: number; readonly connectionState: string }[];
	readonly contexts: readonly { readonly closeCount: number; readonly state: string }[];
	readonly attachedAudioElements: number;
	readonly playCount: number;
}

const CONTROLLED_MEDIA_SOURCE = String.raw`
(() => {
	if (globalThis.__archboardControlledVoiceMedia) return;
	const audit = {
		localTracks: [],
		remoteTracks: [],
		peers: [],
		contexts: [],
		playCount: 0,
	};
	class ControlledTrack extends EventTarget {
		constructor(kind) {
			super();
			this.kind = kind;
			this.enabled = true;
			this.readyState = 'live';
			this.stopCount = 0;
		}
		stop() {
			this.stopCount += 1;
			this.readyState = 'ended';
		}
	}
	class ControlledStream {
		constructor(tracks = []) { this.tracks = tracks; }
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
		constructor(track) { this.track = track; }
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
		getByteTimeDomainData(samples) { samples.set([128, 144, 128, 112]); }
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
	const mediaDevices = new EventTarget();
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

export async function openWithControlledVoiceMedia(
	browser: AgentBrowserSession,
	url: string,
	initScriptPath: string,
): Promise<void> {
	writeFileSync(initScriptPath, CONTROLLED_MEDIA_SOURCE);
	await browser.run(["--init-script", initScriptPath, "open", url]);
	await pollUntil(
		() => browser.eval<boolean>("Boolean(globalThis.__archboardControlledVoiceMedia)"),
		(installed) => installed,
		"the controlled voice media shim to install before the first document",
	);
}

export function readControlledVoiceMediaAudit(
	browser: AgentBrowserSession,
): Promise<ControlledVoiceMediaAudit> {
	return browser.eval<ControlledVoiceMediaAudit>(`(() => {
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
}
