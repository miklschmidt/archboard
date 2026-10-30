// What the live voice owner reads off the page: where the voice is (the dock's key and circle,
// the orb, the voice box over a pane and the key in a presentation's bar), the subtitle in the
// voice box, what was said in the conversation, a walkthrough's position and the focused control.

import { AGENT_DOCK, AGENT_PANEL, PANE_SECTIONS, PRESENTATION_BAR } from "./shell-dom.ts";
import type { AgentBrowserSession } from "./agent-browser.ts";

/** The dock's voice key: Talk while voice is off, then the circle, or End voice while the box has the voice. */
const DOCK_VOICE = `${AGENT_DOCK} [data-slot="voice-circle"]`;
/** Mute in the dock's voice line, while the dock has the voice. */
const DOCK_MUTE = `${AGENT_DOCK} button[aria-label="Mute"]`;
/** The subtitles control in the dock's voice line, while the dock has the voice. */
const DOCK_SUBTITLES = `${AGENT_DOCK} [data-slot="voice-subtitles-toggle"]`;
/** Unmute at the end of the voice box, while the voice is muted. */
const BOX_UNMUTE = '[data-slot="voice-box"] button[aria-label="Unmute"]';
/** The voice key in the bar of a fullscreen presentation: Talk, then End voice. */
const BAR_VOICE = `${PRESENTATION_BAR} [data-voice-key]`;
/**
 * Whether a voice key presses nothing, in the page. Such a key stays focusable and says so with
 * aria-disabled, so a key that is not disabled can still press nothing.
 */
const PRESSES_NOTHING = `(key) => !(key instanceof HTMLButtonElement) || key.disabled || key.getAttribute('aria-disabled') === 'true'`;

/** One line of what was said aloud, as the conversation panel lists it. */
interface SaidLine {
	readonly speaker: string;
	readonly text: string;
	readonly partial: boolean;
}

/** Where the voice is, as the page shows it. */
interface VoiceNow {
	/** What the dock's key shows: `off` while it offers Talk, else the voice's state. */
	readonly state: string | null;
	/** The key's shape: `key` while it offers Talk or the box has the voice, `circle` while the orb is home in the dock. */
	readonly form: string | null;
	/** Whether the dock's key can be pressed. */
	readonly enabled: boolean;
	/** The home the orb rests in, `dock` or `box`, or null while it is in the air or nowhere. */
	readonly orb: string | null;
	/** Whether the orb is lit. */
	readonly lit: boolean;
	/** The voice box while it is on the page and not leaving, or null. */
	readonly box: {
		/** `free` over the picture, or `foot` in a presented walkthrough's box. */
		readonly place: string | null;
		/** The voice's state, as the box shows it. */
		readonly state: string | null;
		/** The label of the pane section the box is drawn in. */
		readonly pane: string | null;
		/** Whether the box and the orb are inside the element presented fullscreen. */
		readonly presented: boolean;
	} | null;
	/** The presentation bar's voice key, `talk` or `live`, and whether it can be pressed; null outside a presentation. */
	readonly bar: { readonly mode: string | null; readonly enabled: boolean } | null;
}

/** The subtitle in the voice box, and the pane it sits over. */
interface SubtitleSnapshot {
	readonly text: string | null;
	/** The label of the pane section the subtitle is drawn inside, or null. */
	readonly pane: string | null;
	/** Whether its box lies within that pane's box. */
	readonly withinPane: boolean;
}

function voiceNow(browser: AgentBrowserSession): Promise<VoiceNow> {
	return browser.eval<VoiceNow>(`(() => {
		const key = document.querySelector('${DOCK_VOICE}');
		const holder = document.querySelector('[data-slot="voice-orb-holder"]');
		const socket = holder?.parentElement?.getAttribute('data-slot') === 'voice-orb-socket' ? holder.parentElement : null;
		const box = [...document.querySelectorAll('[data-slot="voice-box"]:not([data-leaving])')].find(element => element.checkVisibility());
		const bar = document.querySelector('${BAR_VOICE}');
		const presented = document.fullscreenElement;
		const pressesNothing = ${PRESSES_NOTHING};
		return {
			state: key?.getAttribute('data-voice-state') ?? null,
			form: key?.getAttribute('data-form') ?? null,
			enabled: !pressesNothing(key),
			orb: socket?.getAttribute('data-home') ?? null,
			lit: holder?.getAttribute('data-shown') === 'true',
			box: box ? {
				place: box.getAttribute('data-place'),
				state: box.getAttribute('data-voice-state'),
				pane: box.closest('${PANE_SECTIONS}')?.getAttribute('aria-label') ?? null,
				presented: !!presented && presented.contains(box) && !!holder && presented.contains(holder),
			} : null,
			bar: bar && {
				mode: bar.getAttribute('data-voice-key'),
				enabled: !pressesNothing(bar),
			},
		};
	})()`);
}

function subtitleSnapshot(browser: AgentBrowserSession): Promise<SubtitleSnapshot> {
	return browser.eval<SubtitleSnapshot>(`(() => {
		const box = [...document.querySelectorAll('[data-slot="voice-box"]')].find(element => element.checkVisibility());
		const subtitle = box?.querySelector('[data-slot="voice-subtitles"]');
		const pane = subtitle?.closest('${PANE_SECTIONS}') ?? null;
		const inner = subtitle?.getBoundingClientRect();
		const outer = pane?.getBoundingClientRect();
		// The words being said, not the lines of a cue that is giving way, which fade under them.
		const reading = [...(subtitle?.firstElementChild?.children ?? [])]
			.filter(word => !word.hasAttribute('data-fade-out'));
		return {
			text: reading.map(word => word.textContent).join('') || null,
			pane: pane?.getAttribute('aria-label') ?? null,
			withinPane: !!inner && !!outer && inner.width > 0 && inner.left >= outer.left &&
				inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom,
		};
	})()`);
}

/**
 * Whether the voice box holds still, as it does for a person who asked for less motion.
 * @param browser The page.
 * @returns True while the box is on the page and still.
 */
function voiceStill(browser: AgentBrowserSession): Promise<boolean> {
	return browser.eval<boolean>(
		`[...document.querySelectorAll('[data-slot="voice-box"]:not([data-leaving])')].find(element => element.checkVisibility())?.hasAttribute('data-still') === true`,
	);
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

/** Where the pane is in its presentation: the step index, or null, and whether it still moves. */
function presentedStep(
	browser: AgentBrowserSession,
): Promise<{ readonly index: string | null; readonly moving: boolean }> {
	return browser.eval(`(() => {
		const stage = document.querySelector('${PANE_SECTIONS} [data-slot="model-walkthrough"]');
		const surface = stage?.querySelector('[data-slot="semantic-board-surface"]');
		return {
			index: stage?.querySelector('[data-slot="semantic-presentation"]')?.getAttribute('data-step') ?? null,
			moving: !surface || surface.hasAttribute('data-camera-motion') || surface.hasAttribute('data-picture-motion'),
		};
	})()`);
}

/**
 * Whether the focused element matches a selector, and whether a press of it does nothing.
 * @param browser The page.
 * @param selector The element expected to hold focus.
 * @returns [matches, presses nothing].
 */
function focusIs(
	browser: AgentBrowserSession,
	selector: string,
): Promise<readonly [boolean, boolean]> {
	return browser.eval<readonly [boolean, boolean]>(
		`[document.activeElement?.matches(${JSON.stringify(selector)}) === true, (${PRESSES_NOTHING})(document.activeElement)]`,
	);
}

export {
	BAR_VOICE,
	BOX_UNMUTE,
	DOCK_MUTE,
	DOCK_SUBTITLES,
	DOCK_VOICE,
	focusIs,
	presentedStep,
	saidLines,
	subtitleSnapshot,
	voiceNow,
	voiceStill,
	type SaidLine,
	type VoiceNow,
};
