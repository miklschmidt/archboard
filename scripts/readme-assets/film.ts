// What every filmed clip shares: a take's server and browser, the windows filmed on one clock,
// the stage pages that stand beside the shell (an agent's terminal, a timeline), and the moves
// a person makes in the shell.
//
// The pauses in a take are film direction: how long a shot holds so a reader can follow it. They
// are not product durations, so they live with the clip that holds them.

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { Browser, now, type Footage, type Page } from "./browser.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { encodeClip, encodeThumbnail, frameAt, type ClipCut, type Crop } from "./encode.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { holding } from "./holding.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { inRepository } from "./producer.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { startServer, type TakeServer, type TakeSource } from "./server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { ROOT, inOrder, scratch } from "./tools.ts";

/** A take that ran: each window's footage, the take's first and last second, and what it noted. */
interface Take<Noted> {
	readonly footage: readonly Footage[];
	readonly from: number;
	readonly to: number;
	readonly noted: Noted;
}

/** A moment of a take a thumbnail is cut from, and the rectangle it shows. */
interface Moment {
	readonly at: number;
	readonly crop: Crop;
}

/**
 * Run a scene with a server over a fresh copy of a vault and a private browser, and stop both
 * whatever happens, a Ctrl-C included.
 * @param name The clip, which names its directory in the scratch directory.
 * @param vault The tracked vault it is filmed over.
 * @param codex Whether it needs the machine's Codex sign-in.
 * @param scene The scene.
 */
async function withTake(
	name: string,
	vault: TakeSource,
	codex: boolean,
	scene: (server: TakeServer, browser: Browser) => Promise<void>,
): Promise<void> {
	const server = await startServer(name, vault, codex);
	await holding(server.stop, async () => {
		const browser = await Browser.start();
		await holding(
			async () => browser.close(),
			async () => scene(server, browser),
		);
	});
}

/**
 * Film several windows on one clock while an action runs.
 * @param name The clip, which names its frame directories.
 * @param pages The windows, in the order they are stacked.
 * @param action What happens on camera; what it returns is noted with the take.
 * @returns The take.
 */
async function filmTogether<Noted>(
	name: string,
	pages: readonly Page[],
	action: () => Promise<Noted>,
): Promise<Take<Noted>> {
	const stops = await Promise.all(
		pages.map(async (page, index) => page.film(scratch("frames", name, `window-${index}`))),
	);
	// The screencast's first frames arrive a moment after it starts.
	await Bun.sleep(400);
	const from = now();
	const acted = await action().then(
		(noted) => ({ noted }),
		(error: unknown) => ({ error }),
	);
	const to = now();
	const footage = await Promise.all(stops.map(async (stop) => stop()));
	if ("error" in acted) throw acted.error;
	return { footage, from, to, noted: acted.noted };
}

/**
 * Note the moment a thumbnail is cut from: now, around the elements it is about.
 * @param page The page.
 * @param selectors The elements.
 * @param minimumWidth The narrowest the thumbnail's rectangle may be.
 * @param offset Where the page's window sits in the stacked clip; its top left when absent.
 * @param offset.x How far from the clip's left edge.
 * @param offset.y How far from the clip's top edge.
 * @returns The moment.
 */
async function moment(
	page: Page,
	selectors: readonly string[],
	minimumWidth: number,
	offset: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): Promise<Moment> {
	const at = now();
	const crop = await focusCrop(page, selectors, minimumWidth);
	return { at, crop: { ...crop, x: crop.x + offset.x, y: crop.y + offset.y } };
}

/** What a take is encoded into. */
interface ClipOutput {
	/** The clip, as an absolute path: a clip is attached to the README, not kept in the repository. */
	readonly clip: string;
	readonly width: number;
	readonly stack?: ClipCut["stack"];
	readonly leadWithEnd?: number;
	readonly hold?: number;
	readonly fast?: ClipCut["fast"];
	/** The index thumbnail, from the repository root, cut from the windows at the noted moment. */
	readonly thumbnail?: string;
}

/**
 * Encode a take into its clip, and cut its thumbnail from the moment it noted.
 * @param take The take.
 * @param output What it becomes.
 */
async function encodeTake(take: Take<Moment | null>, output: ClipOutput): Promise<void> {
	const { clip, thumbnail, ...cut } = {
		stack: "beside" as const,
		leadWithEnd: 0,
		hold: 0,
		...output,
	};
	await encodeClip({
		...cut,
		windows: take.footage,
		from: take.from,
		to: take.to,
		out: clip,
	});
	const { noted } = take;
	if (thumbnail === undefined || noted === null) return;
	await encodeThumbnail(
		{ images: take.footage.map((window) => frameAt(window, noted.at)), stack: cut.stack },
		noted.crop,
		inRepository(thumbnail),
	);
}

/**
 * Present the active pane fullscreen, as Ctrl+Shift+F does, and take the focus ring off the exit.
 * @param page The shell.
 */
async function present(page: Page): Promise<void> {
	await page.key("F", ["ctrl", "shift"]);
	await page.waitFor("!!document.fullscreenElement", "the pane presented");
	await Bun.sleep(900);
	await page.evaluate("document.activeElement && document.activeElement.blur()");
}

/**
 * Fit every pane's picture to its pane, as the 0 key does, and leave nothing focused.
 * @param page The shell.
 */
async function fit(page: Page): Promise<void> {
	const panes = await page.evaluate(
		`document.querySelectorAll("[data-slot='semantic-board-viewport']").length`,
	);
	// One pane takes the key at a time: the key goes to the pane just focused.
	await inOrder(
		Array.from({ length: Number(panes) }, (_, index) => index),
		async (index) => {
			await page.evaluate(
				`document.querySelectorAll("[data-slot='semantic-board-viewport']")[${index}].focus()`,
			);
			await page.key("0");
		},
	);
	await page.evaluate("document.activeElement && document.activeElement.blur()");
}

/**
 * Fold away every pane's sidebar that is open, so the picture has the room: fold the first one
 * still open, let it animate, and look again.
 * @param page The shell.
 */
async function foldSidebars(page: Page): Promise<void> {
	const open = "[data-slot='semantic-sidebar-toggle'][aria-expanded='true']";
	if (!(await page.evaluate(`!!document.querySelector(${JSON.stringify(open)})`))) return;
	await page.click(open);
	await Bun.sleep(400);
	await foldSidebars(page);
}

/**
 * The 16:9 rectangle a thumbnail is cut from: around the elements, at least a minimum width,
 * kept inside the window.
 * @param page The page.
 * @param selectors The elements the thumbnail is about.
 * @param minimumWidth The narrowest the rectangle may be.
 * @returns The rectangle.
 * @throws {Error} When no element matches.
 */
async function focusCrop(
	page: Page,
	selectors: readonly string[],
	minimumWidth: number,
): Promise<Crop> {
	const box = BoxSchema.parse(
		await page.evaluate(`(() => {
		const boxes = ${JSON.stringify(selectors)}.flatMap((s) => [...document.querySelectorAll(s)]).map((e) => e.getBoundingClientRect());
		if (boxes.length === 0) return null;
		const left = Math.min(...boxes.map((b) => b.left)), top = Math.min(...boxes.map((b) => b.top));
		const right = Math.max(...boxes.map((b) => b.right)), bottom = Math.max(...boxes.map((b) => b.bottom));
		return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
	})()`),
	);
	if (box === null) throw new Error(`Nothing on the page matches ${selectors.join(", ")}.`);
	const fits = (box.height * 16) / 9;
	const width = even(Math.min(page.width, Math.max(minimumWidth, box.width * 1.15, fits * 1.15)));
	const height = even(Math.min(page.height, (width * 9) / 16));
	return {
		x: even(Math.min(Math.max(0, box.x - width / 2), page.width - width)),
		y: even(Math.min(Math.max(0, box.y - height / 2), page.height - height)),
		width,
		height,
	};
}

/** The centre and size of what a thumbnail is about, as the page measures it. */
const BoxSchema = z
	.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
	.nullable();

/**
 * The even number at or below a value: ffmpeg encodes even sizes and offsets.
 * @param value The value.
 * @returns The even number.
 */
function even(value: number): number {
	return 2 * Math.floor(value / 2);
}

/** The agent's terminal, a page beside the shell that shows what an agent runs. */
class Terminal {
	readonly page: Page;

	/**
	 * A terminal page that is ready.
	 * @param page Its page.
	 */
	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Open the terminal page in a window of its own.
	 * @param browser The take's browser.
	 * @param theme Its theme, the shell's.
	 * @param height Its height, the shell window's.
	 * @returns The terminal.
	 */
	static async open(browser: Browser, theme: "light" | "dark", height: number): Promise<Terminal> {
		const page = await browser.open({
			url: stageUrl("terminal.html", { theme }),
			theme,
			width: 600,
			height,
		});
		await page.waitFor("window.ready === true", "the terminal page");
		return new Terminal(page);
	}

	/**
	 * Type what the person asked.
	 * @param text The request.
	 */
	async you(text: string): Promise<void> {
		await this.#call("you", text);
	}

	/**
	 * Type a command the agent runs.
	 * @param text The command line.
	 */
	async command(text: string): Promise<void> {
		await this.#call("command", text);
	}

	/**
	 * Mark the last command finished, and print what it answered.
	 * @param lines What it answered, one line each.
	 */
	async done(...lines: readonly string[]): Promise<void> {
		await this.#call("done", lines);
	}

	/**
	 * Mark the last command refused, and print why.
	 * @param lines What it said, one line each.
	 */
	async refused(...lines: readonly string[]): Promise<void> {
		await this.#call("refused", lines);
	}

	/**
	 * Type what the agent says back.
	 * @param text The sentence.
	 */
	async say(text: string): Promise<void> {
		await this.#call("say", text);
	}

	/**
	 * Call the page's terminal.
	 * @param method The method.
	 * @param argument Its argument.
	 */
	async #call(method: string, argument: unknown): Promise<void> {
		await this.page.evaluate(`window.terminal.${method}(${JSON.stringify(argument)})`);
	}
}

/**
 * The address of a stage page of the kit.
 * @param file The page.
 * @param query What the page reads from its address.
 * @returns The file URL.
 */
function stageUrl(file: string, query: Readonly<Record<string, string>>): string {
	const url = pathToFileURL(join(ROOT, "scripts/readme-assets/stage", file));
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
	return url.toString();
}

export {
	Terminal,
	encodeTake,
	filmTogether,
	fit,
	foldSidebars,
	moment,
	present,
	stageUrl,
	withTake,
	type Moment,
	type Take,
};
