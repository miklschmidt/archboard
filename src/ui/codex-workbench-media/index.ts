// Browser media for the Codex workbench: acquisition, mute, cleanup and
// session ownership over one attached workbench transport.

export { createBrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media/lib/media-owner";
export {
	browserAudioElements,
	browserMediaSupported,
} from "@/ui/codex-workbench-media/lib/media-state";
export type {
	BrowserAudioElementPort,
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaOwnerOptions,
	BrowserWorkbenchMediaSource,
	BrowserWorkbenchMediaState,
} from "@/ui/codex-workbench-media/lib/media-state";
