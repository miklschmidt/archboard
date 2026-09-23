// What the live voice owner reads off the page: the voice controls, the layout around them,
// the fullscreen presentation dock, a walkthrough's position and the focused control.

import { SEMANTIC_STAGE } from "./semantic-page.ts";
import { PANE_SECTIONS, PRESENTATION_BAR, STAGE_ROOT } from "./shell-dom.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

/** The expanded voice controls in the workbench side panel. */
const EXPANDED_CONTROLS = 'section[aria-label="Agent workbench"] [data-voice-controls="expanded"]';
/** The compact voice controls in the fullscreen presentation bar. */
const PRESENTATION_CONTROLS = `${PRESENTATION_BAR} [data-voice-controls="compact"]`;

/** The voice session as the workbench presents it. */
interface VoiceSnapshot {
	/** The expanded controls' state words. */
	readonly stateText: string;
	/** The controls the session offers, by accessible name. */
	readonly controls: string[];
	/** The output wave's state text, from its live region. */
	readonly waveText: string | null;
	/** animated or static, from the wave's own marker. */
	readonly wavePresentation: string | null;
	readonly transcript: string;
	readonly context: string;
	/** What the subtitle over the picture reads, or null when there is none. */
	readonly subtitle: string | null;
}

interface LayoutSnapshot {
	readonly viewport: readonly [number, number, number];
	readonly pageOverflow: boolean;
	readonly voiceInsideWorkbench: boolean;
	readonly voiceOverlapsCanvas: boolean;
	readonly canvasHeight: number;
	readonly workbenchHeight: number;
}

interface PresentationSnapshot {
	readonly fullscreen: boolean;
	readonly stateText: string;
	readonly controls: string[];
	readonly stopEnabled: boolean;
	readonly insideStage: boolean;
	readonly paneChromeHidden: boolean;
}

function voiceSnapshot(browser: AgentBrowserSession): Promise<VoiceSnapshot> {
	return browser.eval<VoiceSnapshot>(`(() => {
		const workbench = document.querySelector('section[aria-label="Agent workbench"]');
		const controls = document.querySelector('${EXPANDED_CONTROLS}');
		const wave = workbench?.querySelector('[data-voice-wave]');
		const panel = name => [...(workbench?.querySelectorAll('[role="tabpanel"]') ?? [])]
			.find(node => node.getAttribute('aria-labelledby') && document.getElementById(node.getAttribute('aria-labelledby'))?.textContent?.startsWith(name));
		return {
			stateText: controls?.querySelector('output')?.textContent?.trim() ?? '',
			controls: [...(controls?.querySelectorAll('button') ?? [])].map(node => node.textContent.trim()),
			waveText: wave?.querySelector('output')?.textContent?.trim() ?? null,
			wavePresentation: wave?.getAttribute('data-voice-wave') ?? null,
			transcript: panel('Transcript')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			context: panel('Context')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
			subtitle: document.querySelector('[data-slot="voice-subtitles"]')?.textContent ?? null,
		};
	})()`);
}

function layoutSnapshot(browser: AgentBrowserSession): Promise<LayoutSnapshot> {
	return browser.eval<LayoutSnapshot>(`(() => {
		const rect = node => node?.getBoundingClientRect() ?? new DOMRect();
		const overlaps = (left, right) => left.width > 0 && left.height > 0 && right.width > 0 &&
			right.height > 0 && left.left < right.right && left.right > right.left &&
			left.top < right.bottom && left.bottom > right.top;
		const voice = document.querySelector('${EXPANDED_CONTROLS}');
		const frame = document.querySelector('section[aria-label="Agent workbench"]');
		const canvas = document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}');
		const voiceRect = rect(voice);
		const frameRect = rect(frame);
		return {
			viewport: [innerWidth, innerHeight, devicePixelRatio],
			pageOverflow: document.documentElement.scrollWidth > innerWidth ||
				document.documentElement.scrollHeight > innerHeight,
			voiceInsideWorkbench: voiceRect.left >= frameRect.left && voiceRect.right <= frameRect.right &&
				voiceRect.top >= frameRect.top && voiceRect.bottom <= frameRect.bottom,
			voiceOverlapsCanvas: overlaps(voiceRect, rect(canvas)),
			canvasHeight: rect(canvas).height,
			workbenchHeight: frameRect.height,
		};
	})()`);
}

function presentationSnapshot(browser: AgentBrowserSession): Promise<PresentationSnapshot> {
	return browser.eval<PresentationSnapshot>(`(() => {
		const stage = document.querySelector('${STAGE_ROOT}');
		const controls = document.querySelector('${PRESENTATION_CONTROLS}');
		const stop = [...(controls?.querySelectorAll('button') ?? [])].find(node => node.getAttribute('aria-label') === 'Stop voice');
		const presented = [...document.querySelectorAll('${PANE_SECTIONS}')].find(node => !node.hidden);
		const chrome = [...(presented?.querySelectorAll('[data-slot="semantic-sidebar"], [data-slot="semantic-view-bar"], [data-slot="semantic-variant-bar"]') ?? [])];
		return {
			fullscreen: document.fullscreenElement === stage,
			stateText: controls?.querySelector('output')?.textContent?.trim() ?? '',
			controls: [...(controls?.querySelectorAll('button') ?? [])].map(node => node.getAttribute('aria-label') ?? ''),
			stopEnabled: stop instanceof HTMLButtonElement && !stop.disabled,
			insideStage: !!controls && !!stage && stage.contains(controls),
			paneChromeHidden: chrome.every(node => !node.checkVisibility()),
		};
	})()`);
}

/** Where the pane is in its presentation: the step index, or null, and whether it still moves. */
function presentedStep(
	browser: AgentBrowserSession,
): Promise<{ readonly index: string | null; readonly moving: boolean }> {
	return browser.eval(`(() => {
		const stage = document.querySelector('${PANE_SECTIONS} ${SEMANTIC_STAGE}');
		const surface = stage?.querySelector('[data-slot="semantic-board-surface"]');
		return {
			index: stage?.getAttribute('data-presentation-step') ?? null,
			moving: !surface || surface.hasAttribute('data-camera-motion') || surface.hasAttribute('data-picture-motion'),
		};
	})()`);
}

/** The accessible name of the focused element, and whether it is disabled. */
function focusedControl(browser: AgentBrowserSession): Promise<readonly [string, boolean]> {
	return browser.eval<readonly [string, boolean]>(
		"[document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '', document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled]",
	);
}

export {
	EXPANDED_CONTROLS,
	PRESENTATION_CONTROLS,
	focusedControl,
	layoutSnapshot,
	presentationSnapshot,
	presentedStep,
	voiceSnapshot,
};
