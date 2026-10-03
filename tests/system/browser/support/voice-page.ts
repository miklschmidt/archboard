// What the live voice owner reads off the page: the one voice control (Talk,
// or the live controls) in the agent bar and in the presentation bar, the
// subtitle over the voice pane, what was said in the conversation panel, a
// walkthrough's position and the focused control.

import { SEMANTIC_STAGE } from "./semantic-page.ts";
import {
	AGENT_BAR,
	AGENT_PANEL,
	PANE_SECTIONS,
	PRESENTATION_BAR,
	STAGE_ROOT,
} from "./shell-dom.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

/** The voice control in the agent bar: Talk while voice is off, the live controls while on. */
const BAR_VOICE = `${AGENT_BAR} [data-voice-controls]`;
/** The same control in the fullscreen presentation bar. */
const PRESENTATION_VOICE = `${PRESENTATION_BAR} [data-voice-controls]`;

/** One live control's button, by accessible name, inside a bar's voice control. */
const liveButton = (scope: string, name: string): string =>
	`${scope}[data-voice-controls="live"] button[aria-label=${JSON.stringify(name)}]`;
/** The live control's End: its one button named by its words rather than a label. */
const endButton = (scope: string): string =>
	`${scope}[data-voice-controls="live"] > button:not([aria-label])`;

/** One line of what was said aloud, as the conversation panel lists it. */
interface SaidLine {
	readonly speaker: string;
	readonly text: string;
	readonly partial: boolean;
}

/** The voice control as one bar presents it. */
interface VoiceSnapshot {
	/** talk or live, from the control's own marker; null when the bar has none. */
	readonly mode: string | null;
	/** Whether Talk can be pressed (false while voice is on its way, or live). */
	readonly talkEnabled: boolean;
	/** The live controls' buttons, by accessible name. */
	readonly controls: string[];
	/** The output wave's state text, from its live region. */
	readonly waveText: string | null;
	/** animated or static, from the wave's own marker. */
	readonly wavePresentation: string | null;
}

/** The subtitle over the picture, and the pane it sits over. */
interface SubtitleSnapshot {
	readonly text: string | null;
	/** The label of the pane section the subtitle is drawn inside, or null. */
	readonly pane: string | null;
	/** Whether its box lies within that pane's box. */
	readonly withinPane: boolean;
}

interface LayoutSnapshot {
	readonly viewport: readonly [number, number, number];
	readonly pageOverflow: boolean;
	readonly voiceInsideBar: boolean;
	readonly voiceOverlapsStage: boolean;
	readonly barHeight: number;
	/** Every button of the bar's voice control: its name and height. */
	readonly buttons: readonly { readonly name: string; readonly height: number }[];
}

interface PresentationSnapshot {
	readonly fullscreen: boolean;
	readonly voice: VoiceSnapshot;
	readonly insideStage: boolean;
	readonly paneChromeHidden: boolean;
}

/** The expression reading one voice control, given a selector for it. */
const readVoice = (selector: string): string => `(() => {
	const control = document.querySelector('${selector}');
	const talk = control?.getAttribute('data-voice-controls') === 'talk' ? control : null;
	const wave = control?.querySelector('[data-voice-wave]');
	return {
		mode: control?.getAttribute('data-voice-controls') ?? null,
		talkEnabled: talk instanceof HTMLButtonElement && !talk.disabled,
		controls: talk ? [] : [...(control?.querySelectorAll('button') ?? [])]
			.map(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim()),
		waveText: wave?.querySelector('output')?.textContent?.trim() ?? null,
		wavePresentation: wave?.getAttribute('data-voice-wave') ?? null,
	};
})()`;

function voiceSnapshot(browser: AgentBrowserSession): Promise<VoiceSnapshot> {
	return browser.eval<VoiceSnapshot>(readVoice(BAR_VOICE));
}

function subtitleSnapshot(browser: AgentBrowserSession): Promise<SubtitleSnapshot> {
	return browser.eval<SubtitleSnapshot>(`(() => {
		const subtitle = document.querySelector('[data-slot="voice-subtitles"]');
		const pane = subtitle?.closest('${PANE_SECTIONS}') ?? null;
		const inner = subtitle?.getBoundingClientRect();
		const outer = pane?.getBoundingClientRect();
		return {
			text: subtitle?.textContent || null,
			pane: pane?.getAttribute('aria-label') ?? null,
			withinPane: !!inner && !!outer && inner.width > 0 && inner.left >= outer.left &&
				inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom,
		};
	})()`);
}

/** What was said aloud, as the open conversation panel lists it; empty while it is closed. */
function saidLines(browser: AgentBrowserSession): Promise<SaidLine[]> {
	return browser.eval<
		SaidLine[]
	>(`[...document.querySelectorAll('${AGENT_PANEL} [data-slot="voice-lines"] li[data-speaker]')]
		.map(line => ({
			speaker: line.getAttribute('data-speaker'),
			text: (line.lastElementChild?.textContent ?? '').trim(),
			partial: line.getAttribute('aria-busy') === 'true',
		}))`);
}

function layoutSnapshot(browser: AgentBrowserSession): Promise<LayoutSnapshot> {
	return browser.eval<LayoutSnapshot>(`(() => {
		const rect = node => node?.getBoundingClientRect() ?? new DOMRect();
		const overlaps = (left, right) => left.width > 0 && left.height > 0 && right.width > 0 &&
			right.height > 0 && left.left < right.right && left.right > right.left &&
			left.top < right.bottom && left.bottom > right.top;
		const voice = document.querySelector('${BAR_VOICE}');
		const voiceRect = rect(voice);
		const barRect = rect(document.querySelector('${AGENT_BAR}'));
		const buttons = voice instanceof HTMLButtonElement ? [voice] : [...(voice?.querySelectorAll('button') ?? [])];
		return {
			viewport: [innerWidth, innerHeight, devicePixelRatio],
			pageOverflow: document.documentElement.scrollWidth > innerWidth ||
				document.documentElement.scrollHeight > innerHeight,
			voiceInsideBar: voiceRect.width > 0 && voiceRect.left >= barRect.left &&
				voiceRect.right <= barRect.right && voiceRect.top >= barRect.top &&
				voiceRect.bottom <= barRect.bottom,
			voiceOverlapsStage: overlaps(voiceRect, rect(document.querySelector('${STAGE_ROOT}'))),
			barHeight: barRect.height,
			buttons: buttons.map(node => ({
				name: (node.getAttribute('aria-label') ?? node.textContent ?? '').trim(),
				height: node.getBoundingClientRect().height,
			})),
		};
	})()`);
}

function presentationSnapshot(browser: AgentBrowserSession): Promise<PresentationSnapshot> {
	return browser.eval<PresentationSnapshot>(`(() => {
		const stage = document.querySelector('${STAGE_ROOT}');
		const control = document.querySelector('${PRESENTATION_VOICE}');
		const presented = [...document.querySelectorAll('${PANE_SECTIONS}')].find(node => !node.hidden);
		const chrome = [...(presented?.querySelectorAll('[data-slot="semantic-sidebar"], [data-slot="semantic-view-bar"]') ?? [])];
		return {
			fullscreen: document.fullscreenElement === stage,
			voice: ${readVoice(PRESENTATION_VOICE)},
			insideStage: !!control && !!stage && stage.contains(control),
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

/**
 * Whether the focused element matches a selector, and whether it is disabled.
 * @param browser The page.
 * @param selector The element expected to hold focus.
 * @returns [matches, disabled].
 */
function focusIs(
	browser: AgentBrowserSession,
	selector: string,
): Promise<readonly [boolean, boolean]> {
	return browser.eval<readonly [boolean, boolean]>(
		`[document.activeElement?.matches(${JSON.stringify(selector)}) === true, document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled]`,
	);
}

export {
	BAR_VOICE,
	PRESENTATION_VOICE,
	endButton,
	focusIs,
	layoutSnapshot,
	liveButton,
	presentationSnapshot,
	presentedStep,
	saidLines,
	subtitleSnapshot,
	voiceSnapshot,
	type SaidLine,
};
