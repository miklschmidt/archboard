// The browser media of the workbench: the owner of the microphone, the mute and the realtime media session over one attached transport, the audio elements it plays through, and the snapshot of the session. Safe for the browser.
export { createBrowserWorkbenchMediaOwner } from "#ui/clients/media/media-owner.ts";
export { browserAudioElements } from "#ui/clients/media/media-state.ts";
export type {
	BrowserAudioElementPort,
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaOwnerOptions,
	BrowserWorkbenchMediaState,
} from "#ui/clients/media/media-state.ts";
export type { RealtimeMediaSnapshot } from "#ui/clients/realtime/run.ts";
