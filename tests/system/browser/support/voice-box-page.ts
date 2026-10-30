// What the browser owners of the voice read of the page: where the voice is and where its orb is,
// the page a frame at a time while the orb moves, and the subtitles control in either surface.
// And how they get a voice: the production server over the fake Codex, a page whose microphone,
// peer connection and audio are stand-ins, and a press of Talk. The fake's model says a scripted
// line a word at a time, and its output is a steady tone, which the voice hears as speaking.

import { join } from "node:path";

import {
	prepareProductionFixture,
	type ProductionFixture,
} from "../../server-state/support/codex-production.ts";
import { startOwnedServer, type OwnedServer } from "../../support/owned-server.ts";
import { vaultIn } from "../../support/test-vault.ts";
import {
	browserTestRoots,
	registerServerBase,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./agent-browser.ts";
import { openWithControlledVoiceMedia } from "./codex-live-voice.ts";
import { DOCK_VOICE } from "./voice-page.ts";
import { productionServer } from "../../server-state/support/production-server.ts";

const FAKE_CODEX = join(import.meta.dir, "../../server-state/fixtures/fake-codex-production.ts");

/** A server whose Codex is the fake, the fake's files and the server's vault. */
export interface VoiceServer {
	readonly server: OwnedServer;
	readonly fixture: ProductionFixture;
	readonly vault: string;
}

/**
 * Start a server whose Codex is the fake, so that Talk starts a real voice session.
 * @param resources What tears it down.
 * @param vaultName The vault's directory under the owner's root.
 * @returns The server, the fake's files and the vault.
 */
export async function startVoiceServer(
	resources: AsyncDisposableStack,
	vaultName: string,
): Promise<VoiceServer> {
	const fixture = prepareProductionFixture(resources, FAKE_CODEX);
	const vault = vaultIn(join(browserTestRoots().ownerRoot, vaultName));
	const server = await startOwnedServer({
		...productionServer,
		vault,
		env: serverTestEnvironment({
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
		}),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	return { server, fixture, vault };
}

/**
 * Open a page whose media are stand-ins, so that Talk needs no microphone.
 * @param browser The browser.
 * @param url The page.
 */
export const openForVoice = (browser: AgentBrowserSession, url: string): Promise<void> =>
	openWithControlledVoiceMedia(
		browser,
		url,
		join(browserTestRoots().ownerRoot, "controlled-voice-media.js"),
	);

/**
 * Press Talk in the agent dock.
 * @param browser The page.
 * @returns What the browser said.
 */
export const talk = (browser: AgentBrowserSession): Promise<string> =>
	browser.run(["click", DOCK_VOICE]);

/** The subtitles control in the voice box. */
export const SUBTITLES_IN_BOX = '[data-slot="voice-box"] [data-slot="voice-subtitles-toggle"]';

/** Short on purpose: a flight is under a second, and every wait here names itself. */
export const WAIT = { timeoutMs: 8_000 } as const;

/** Where the voice is, as the page shows it. */
export interface VoiceWhere {
	/** Whether the voice box is on the page. */
	readonly box: boolean;
	/** The home the orb rests in, or null while it is in the air. */
	readonly home: string | null;
	/** How far the orb's middle is from its socket's, in pixels. */
	readonly off: number;
	/** The dock's key: the circle while the orb is at home in the dock, the key while the box has it. */
	readonly form: string | null;
	readonly keyName: string | null;
	/** How many orbs the page draws, wherever they are. */
	readonly orbs: number;
	/** The surface that holds keyboard focus: the voice box, the dock, or neither. */
	readonly focus: string | null;
	/** Whether the box's words show. */
	readonly words: boolean;
	/** Whether the box's own words let the picture under them take the pointer. */
	readonly wordsClickThrough: boolean;
	/** Whether the box's subtitles control takes the pointer. */
	readonly controlClickable: boolean;
	/** Where the orb's middle is, or null while it is nowhere on the page. */
	readonly at: readonly [number, number] | null;
	/** How much of the orb shows: a flight carries an orb that is seen, and a fresh one has not faded in yet. */
	readonly opacity: number;
	/** Whether the box's socket draws a seat of its own: the plate is the orb's. */
	readonly boxDrawsSeat: boolean;
}

/** What the page saw of the orb and of itself on one frame. */
export interface Seen {
	/** How far the page's scrollable size is past the window, in pixels. */
	readonly over: number;
	/** Whether the orb is in the layer it flies in. */
	readonly air: boolean;
	readonly at: readonly [number, number] | null;
	readonly opacity: number | null;
	/** The dock's key: the circle while the orb is at home in the dock, the key while it is not. */
	readonly form: string | null;
	/** How much of the dock's plate is drawn. */
	readonly seat: number | null;
	/** The home the orb rests in, or null while it is in the air. */
	readonly home: string | null;
	/** What the voice is doing, as the dock says. */
	readonly state: string | null;
	/** Whether a lit orb is somewhere the page does not paint: a fullscreen page paints only the element presented. */
	readonly hidden: boolean;
}

/** What the page says of where the voice is. */
export const WHERE = `(() => {
	const centre = (element) => {
		const box = element.getBoundingClientRect();
		return [box.x + box.width / 2, box.y + box.height / 2];
	};
	const holder = document.querySelector('[data-slot="voice-orb-holder"]');
	const socket = holder?.parentElement?.getAttribute('data-slot') === 'voice-orb-socket' ? holder.parentElement : null;
	const [hx, hy] = holder ? centre(holder) : [Number.NaN, Number.NaN];
	const [sx, sy] = socket ? centre(socket) : [Number.NaN, Number.NaN];
	const key = document.querySelector('[data-slot="voice-circle"]');
	const voice = [...document.querySelectorAll('[data-slot="voice-box"]')].find(element => element.checkVisibility());
	const words = voice?.querySelector('[data-slot="voice-subtitles"]');
	const control = voice?.querySelector('[data-slot="voice-subtitles-toggle"]');
	const under = (element) => {
		const [x, y] = centre(element);
		return document.elementFromPoint(x, y);
	};
	const seat = voice?.querySelector('[data-slot="voice-orb-socket"]');
	const seatStyle = seat ? getComputedStyle(seat) : null;
	return {
		box: voice !== undefined,
		home: socket?.getAttribute('data-home') ?? null,
		off: socket ? Math.round(Math.hypot(hx - sx, hy - sy) * 10) / 10 : -1,
		form: key?.getAttribute('data-form') ?? null,
		keyName: key?.getAttribute('aria-label') ?? null,
		orbs: document.querySelectorAll('[data-slot="voice-orb"]').length,
		focus: document.activeElement?.closest('[data-slot="voice-box"], [data-slot="agent-dock"]')?.getAttribute('data-slot') ?? null,
		words: words?.getAttribute('data-showing') === 'true',
		wordsClickThrough: words ? !under(words)?.closest('[data-slot="voice-box"]') : true,
		controlClickable: control ? under(control) === control || control.contains(under(control)) : true,
		at: holder && !Number.isNaN(hx) ? [hx, hy] : null,
		opacity: holder ? Number(getComputedStyle(holder).opacity) : 0,
		boxDrawsSeat: seatStyle ? Number.parseFloat(seatStyle.borderTopWidth) > 0 || seatStyle.boxShadow !== 'none' || seatStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' : false,
	};
})()`;

/** Watch the page a frame at a time, from now on: what it did while the orb moved is read afterwards. */
export const WATCH = `(() => {
	const seen = [];
	window.__voiceSeen = seen;
	(function frame() {
		const page = document.scrollingElement;
		const holder = document.querySelector('[data-slot="voice-orb-holder"]');
		const box = holder?.getBoundingClientRect();
		const key = document.querySelector('[data-slot="voice-circle"]');
		const plate = key?.querySelector('[data-part="plate"]');
		seen.push({
			over: Math.max(page.scrollHeight - innerHeight, page.scrollWidth - innerWidth),
			air: holder?.parentElement?.getAttribute('data-slot') === 'voice-orb-layer',
			at: box && box.width ? [box.x + box.width / 2, box.y + box.height / 2] : null,
			opacity: holder ? Number(getComputedStyle(holder).opacity) : null,
			form: key?.getAttribute('data-form') ?? null,
			seat: plate ? Number(getComputedStyle(plate).opacity) : null,
			home: holder?.parentElement?.getAttribute('data-home') ?? null,
			state: key?.getAttribute('data-voice-state') ?? null,
			hidden: !!holder && document.fullscreenElement !== null && !document.fullscreenElement.contains(holder) && Number(getComputedStyle(holder).opacity) > 0.05,
		});
		requestAnimationFrame(frame);
	})();
	return true;
})()`;

/**
 * Everything the page has seen since it was watched.
 * @param browser The page.
 * @returns The frames, oldest first.
 */
export const seenSoFar = (browser: AgentBrowserSession): Promise<Seen[]> =>
	browser.eval<Seen[]>("window.__voiceSeen");

/**
 * How far apart two places are.
 * @param from One place.
 * @param to Another.
 * @returns The distance in pixels.
 */
export const apart = (from: readonly [number, number], to: readonly [number, number]): number =>
	Math.hypot(from[0] - to[0], from[1] - to[1]);

/**
 * Where the voice is.
 * @param browser The page.
 * @returns What the page says.
 */
export const voiceWhere = (browser: AgentBrowserSession): Promise<VoiceWhere> =>
	browser.eval<VoiceWhere>(WHERE);

/**
 * Click the subtitles control in one surface, where a script can: the keyboard has its own check below.
 * @param browser The page.
 * @param surface The surface that has it.
 * @returns True when the control was there to click.
 */
export const clickSubtitles = (browser: AgentBrowserSession, surface: "voice-box" | "agent-dock") =>
	browser.eval<boolean>(
		`(() => { const button = [...document.querySelectorAll('[data-slot="${surface}"] [data-slot="voice-subtitles-toggle"]')].find(element => element.checkVisibility());` +
			` if (!button) return false; button.click(); return true; })()`,
	);
