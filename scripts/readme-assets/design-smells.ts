// The design-smells clip: Archboard's own model, read in the Measures tab of the reader with this
// repository's real Git history. The terminal beside the shell summarizes `archboard model
// locality`. Nothing is canned: every count on the screen is read from the checkout.
//
// The clip is filmed over this checkout's vault in place, so it only reads. The code history of a
// year takes the server a few seconds, so the take reads it once before the camera runs: the
// browser keeps its answer, and the camera then films the Measures tab on a read list. With nothing
// selected the Right panel shows the model's own summary, so the take selects the first module
// before the camera runs and the clip never shows that summary.
//
// A beat names its module. The top of a sort is often one of several modules that tie, and a
// module that reads as a smell is chosen by what it shows, not by where a tie happens to put it.

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";

import {
	Browser,
	Terminal,
	attachmentFile,
	encodeTake,
	ffmpeg,
	filmTogether,
	holding,
	now,
	readmeFile,
	startCheckoutServer,
	type Moment,
	type Page,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import type { Footage } from "./browser.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { modelResult, readModel } from "./model-authoring.ts";

const CLIP = attachmentFile("design-smells.webp");
/** The clip's width: the pixels of the shell and the terminal, so that a column head is as drawn. */
const WIDTH = 1920;
const THUMBNAIL = readmeFile("idx-design-smells.webp");
/** The shell beside the terminal. A pane under 900 px hides its Right panel until a selection. */
const PANE = { width: 1440, height: 1080 } as const;
const TERMINAL = { width: 480, path: "~/archboard" } as const;
const PANEL = "[data-slot='model-panel']";
/** How long the first read of a year of Git may take on the real history. */
const HISTORY_MS = 120_000;
/** The thumbnail: the top of the shell, above the agent dock, with the list and its Right panel. */
const STILL = { x: TERMINAL.width, y: 0, width: PANE.width, height: 810 } as const;
/** The canvas of the shell, where a picture is drawn: from the list to the Right panel. */
const CANVAS = { x: 460, y: 60, width: 600, height: 900 } as const;
/** How little the canvas may vary, in levels of brightness, before it counts as blank. */
const BLANK_SPREAD = 6;
/** The module each beat shows, by its name in the model. */
const BEATS = {
	unjoined: "Diagram surface",
	shallow: "Retained reads",
	passThrough: "Command contract",
} as const;

/** A row of the list: the module's identity, and its counts by measure. */
const RowSchema = z.object({ id: z.string(), counts: z.record(z.string(), z.number()) });
/** A row, with the name of its module. */
type Row = z.infer<typeof RowSchema> & { readonly name: string };
/** The name of every module of the model, by identity. */
type Names = ReadonlyMap<string, string>;

/**
 * A count with its noun.
 * @param count How many.
 * @param one The noun for one.
 * @param many The noun for any other count.
 * @returns The words.
 */
function words(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/**
 * The identity of the one module that a name gives.
 * @param names Every module's name, by identity.
 * @param name The name.
 * @returns The identity.
 * @throws {Error} When no module has the name, or more than one has.
 */
function idOf(names: Names, name: string): string {
	const found = [...names].filter(([, one]) => one === name).map(([id]) => id);
	const [only, ...more] = found;
	if (only === undefined || more.length > 0)
		throw new Error(`${name} names ${found.length} modules of the model, not one.`);
	return only;
}

/**
 * The row of a module in the list, with every count it shows.
 * @param page The shell.
 * @param id The module's identity.
 * @param name Its name.
 * @returns Its name and counts.
 * @throws {Error} When the list has no row for it.
 */
async function rowOf(page: Page, id: string, name: string): Promise<Row> {
	const row = RowSchema.parse(
		await page.evaluate(`(() => {
			const row = document.querySelector("[data-measure-row='${id}']");
			if (row === null) return null;
			const counts = {};
			for (const cell of row.querySelectorAll("[data-measure][data-count]")) {
				counts[cell.getAttribute("data-measure")] = Number(cell.getAttribute("data-count"));
			}
			return { id: row.getAttribute("data-measure-row"), counts };
		})()`),
	);
	return { ...row, name };
}

/**
 * Open a choice of the shelf, and pick the entry that begins with some words.
 * @param page The shell.
 * @param select The choice's slot.
 * @param label How the entry begins.
 */
async function choose(page: Page, select: string, label: string): Promise<void> {
	const options = "[data-slot='select-content'] [role='option']";
	await page.click(`[data-slot='${select}']`);
	await page.waitFor(`document.querySelector(${JSON.stringify(options)}) !== null`, select);
	// The popup eases in; a press on an entry that is still moving would miss it.
	await Bun.sleep(450);
	await page.evaluate(`(() => {
		for (const old of document.querySelectorAll("[data-readme-pick]")) old.removeAttribute("data-readme-pick");
		const entries = [...document.querySelectorAll(${JSON.stringify(options)})];
		entries.find((one) => one.textContent.trim().startsWith(${JSON.stringify(label)}))?.setAttribute("data-readme-pick", "");
	})()`);
	await page.click("[data-readme-pick]");
}

/**
 * Sort the list by a measure and wait until its head is lit.
 * @param page The shell.
 * @param measure The measure's name as the sort says it.
 */
async function sortBy(page: Page, measure: string): Promise<void> {
	await choose(page, "model-measure-sort", measure);
	await page.waitFor(
		`document.querySelector("[data-measure-head='sorted']")?.textContent.trim() === ${JSON.stringify(measure)}`,
		`the list sorted by ${measure}`,
	);
	await Bun.sleep(400);
}

/**
 * Wait for an element of the page.
 * @param page The shell.
 * @param selector The element.
 */
async function shows(page: Page, selector: string): Promise<void> {
	await page.waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, selector);
}

/**
 * Select a module's row, wait until the Right panel explains it, and let the picture settle, so
 * that the camera never films through the change of a selection.
 * @param page The shell.
 * @param names Every module's name, by identity.
 * @param name The module's name.
 * @returns The row.
 */
async function selectRow(page: Page, names: Names, name: string): Promise<Row> {
	const id = idOf(names, name);
	await page.atRest();
	const row = await rowOf(page, id, name);
	await page.click(`[data-measure-row='${id}']`);
	await page.waitFor(
		`document.querySelector("${PANEL} [data-slot='module-details']")?.getAttribute("data-module-id") === ${JSON.stringify(id)}`,
		`${name} explained in the Right panel`,
	);
	await page.atRest();
	await Bun.sleep(500);
	return row;
}

/**
 * Refuse a clip that shows where the person who films it lives.
 * @param pages The windows that are filmed.
 * @throws {Error} When a window holds the home directory's path.
 */
async function requireNoHomePath(pages: readonly Page[]): Promise<void> {
	const home = JSON.stringify(homedir());
	await Promise.all(
		pages.map(async (page) => {
			if (await page.evaluate(`document.documentElement.outerHTML.includes(${home})`))
				throw new Error("A filmed window shows the home directory's path.");
		}),
	);
}

/**
 * Read the code history of the checkout through the CLI, as the terminal reports it.
 * @param server The take's server.
 * @returns The locality answer.
 */
async function readLocality(server: TakeServer) {
	return ArchitectureHistoryResultSchema.options[0].parse(
		modelResult(await server.cli(["model", "locality"])),
	);
}

/**
 * The summary lines of the locality answer.
 * @param locality The answer.
 * @returns The lines the terminal prints under its command.
 */
function localityLines(locality: Awaited<ReturnType<typeof readLocality>>): readonly string[] {
	const since = locality.periods.map((period) => period.since).toSorted()[0];
	const unjoined = locality.coupling.filter((pair) => pair.unjoined).length;
	return [
		`${words(locality.hotspots.length, "module", "modules")} read since ${since?.slice(0, 10) ?? "the first commit"}`,
		`${words(locality.coupling.length, "pair changes", "pairs change")} together, ${unjoined} with no relationship`,
	];
}

/**
 * Open the reader on the model, and read the code history once before the camera runs: open
 * Measures, wait for its read, sort by Unjoined, and select the module of the first beat.
 * @param server The take's server.
 * @param browser The private browser.
 * @param model The canonical model's identity.
 * @param names Every module's name, by identity.
 * @returns The page, on Measures with the first beat's module selected.
 */
async function openReader(
	server: TakeServer,
	browser: Browser,
	model: string,
	names: Names,
): Promise<Page> {
	const page = await browser.open({
		url: `${server.url}/?modelA=${model}`,
		theme: "light",
		width: PANE.width,
		height: PANE.height,
		cursor: true,
	});
	await page.atRest();
	await page.click("[data-destination='measures']");
	await page.waitFor(
		"document.querySelector(\"[data-slot='model-measures']\")?.getAttribute('data-history') === 'read'",
		"the code history of the checkout",
		HISTORY_MS,
	);
	await sortBy(page, "Unjoined");
	await selectRow(page, names, BEATS.unjoined);
	await page.moveTo({ x: 1000, y: 700 }, 1);
	await Bun.sleep(900);
	return page;
}

/**
 * A brightness statistic that ffmpeg printed for one frame.
 * @param block What ffmpeg printed for the frame.
 * @param name The statistic, such as YMAX.
 * @returns Its value, or nought when it is missing.
 */
function level(block: string, name: string): number {
	return Number(new RegExp(`signalstats\\.${name}=(\\d+)`, "u").exec(block)?.[1] ?? 0);
}

/**
 * Whether the canvas of a frame is blank: it varies by hardly a level of brightness.
 * @param block What ffmpeg printed for the frame.
 * @returns Whether it is blank.
 */
function isBlank(block: string): boolean {
	return level(block, "YMAX") - level(block, "YMIN") < BLANK_SPREAD;
}

/**
 * The frames of the shell in which the canvas is blank. The reader clears the picture for an
 * instant when a selection moves it to another scope, and the camera, filmed in real time, catches
 * that instant in a frame or two. A frame of it is dropped from the clip, so that the frame before
 * it stays on screen a moment longer.
 * @param shell The shell's footage.
 * @param before The second after which the canvas holds a page that is blank on purpose.
 * @returns The files of the blank frames.
 */
async function blankFrames(shell: Footage, before: number): Promise<ReadonlySet<string>> {
	const frames = shell.frames.filter((frame) => frame.at < before);
	const list = join(shell.directory, "blank.ffconcat");
	const stats = join(shell.directory, "blank.stats");
	const files = [...frames.map((frame) => frame.file), frames.at(-1)?.file ?? ""];
	writeFileSync(
		list,
		`ffconcat version 1.0\n${files.map((file) => `file '${file}'\nduration 0.04`).join("\n")}\n`,
	);
	const { x, y, width, height } = CANVAS;
	await ffmpeg([
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		list,
		"-fps_mode",
		"passthrough",
		"-vf",
		`crop=${width}:${height}:${x}:${y},signalstats,metadata=print:file=${stats}`,
		"-f",
		"null",
		"-",
	]);
	const measured = readFileSync(stats, "utf8")
		.split(/^frame:/mu)
		.slice(1);
	return new Set(
		frames.filter((_, index) => isBlank(measured[index] ?? "")).map((frame) => frame.file),
	);
}

/**
 * Say what a row of the list counts, as a sentence in the terminal.
 * @param terminal The filmed terminal.
 * @param row The row.
 * @param sentence The sentence, from the row's counts.
 */
async function say(terminal: Terminal, row: Row, sentence: (counts: Row["counts"]) => string) {
	await terminal.say(`${row.name}: ${sentence(row.counts)}`);
}

/**
 * The first beat, already selected before the camera runs: a module whose Right panel lists the
 * modules that change with it, with no relationship to join them.
 * @param page The shell.
 * @param terminal The filmed terminal.
 * @param names Every module's name, by identity.
 */
async function showUnjoined(page: Page, terminal: Terminal, names: Names): Promise<void> {
	await shows(page, `${PANEL} [data-slot='model-panel-changes-with']`);
	const row = await rowOf(page, idOf(names, BEATS.unjoined), BEATS.unjoined);
	await say(terminal, row, (counts) => {
		const unjoined = words(counts["unjoined"] ?? 0, "module changes", "modules change");
		return `${unjoined} with it and nothing joins them.`;
	});
}

/**
 * A module with a wide interface and nothing behind it: sort by Entries, select it by name, and
 * hold on its row and its Right panel.
 * @param page The shell.
 * @param terminal The filmed terminal.
 * @param names Every module's name, by identity.
 */
async function showShallow(page: Page, terminal: Terminal, names: Names): Promise<void> {
	await page.atRest();
	await sortBy(page, "Entries");
	const row = await selectRow(page, names, BEATS.shallow);
	await shows(page, `${PANEL} [data-slot='model-panel-implementation']`);
	await say(terminal, row, (counts) => {
		const entries = words(counts["entryPoints"] ?? 0, "entry", "entries");
		return `${entries} and ${counts["hiddenParts"] ?? 0} hidden parts: nothing stands behind its interface.`;
	});
}

/**
 * Entries that only pass a call on: sort by Pass-through, select a module by name, and end on its
 * About page, where each such entry says where it passes the call.
 * @param page The shell.
 * @param terminal The filmed terminal.
 * @param names Every module's name, by identity.
 * @returns The second the page opened About.
 */
async function showPassThrough(page: Page, terminal: Terminal, names: Names): Promise<number> {
	await page.atRest();
	await sortBy(page, "Pass-through");
	const row = await selectRow(page, names, BEATS.passThrough);
	await shows(page, `${PANEL} [data-slot='model-panel-interface']`);
	await say(terminal, row, (counts) => {
		const entries = words(counts["entryPoints"] ?? 0, "entry", "entries");
		return `${counts["passThrough"] ?? 0} of ${entries} pass a call straight on.`;
	});
	await Bun.sleep(1800);
	const aboutAt = now();
	await page.click("[data-slot='model-interface-about']");
	await page.waitFor(
		"(document.querySelector(\"[data-slot='model-about']\")?.innerText ?? '').includes('passes one call on')",
		"the entries that pass a call on, in About",
	);
	await page.atRest();
	return aboutAt;
}

/**
 * Film the three beats, with the terminal reporting the locality of the checkout.
 * @param server The take's server.
 * @param browser The private browser.
 */
async function film(server: TakeServer, browser: Browser): Promise<void> {
	const model = await readModel(server);
	const names = new Map(model.modules.map((module) => [module.id, module.name]));
	const locality = await readLocality(server);
	const terminal = await Terminal.open(browser, "light", PANE.height, TERMINAL);
	const page = await openReader(server, browser, model.manifest.id, names);
	const take = await filmTogether("design-smells", [terminal.page, page], async () => {
		await Bun.sleep(500);
		await terminal.say(
			"Where does the design cost the most?\nArchboard's own model and this repository's Git history.",
		);
		await terminal.command("archboard model locality");
		await terminal.done(...localityLines(locality));
		await showUnjoined(page, terminal, names);
		await Bun.sleep(1800);
		await showShallow(page, terminal, names);
		const still: Moment = { at: now(), crop: STILL };
		await Bun.sleep(2200);
		const aboutAt = await showPassThrough(page, terminal, names);
		await Bun.sleep(3200);
		await requireNoHomePath([terminal.page, page]);
		return { still, aboutAt };
	});
	const blank = await blankFrames(take.footage[1]!, take.noted.aboutAt);
	const footage = take.footage.map((window, index) =>
		index === 1
			? { ...window, frames: window.frames.filter(({ file }) => !blank.has(file)) }
			: window,
	);
	await encodeTake(
		{ ...take, footage, noted: take.noted.still },
		{ clip: CLIP, width: WIDTH, thumbnail: THUMBNAIL },
	);
}

const designSmells: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Start an Archboard server over this checkout's own vault, in place and read only, and read a year of this repository's Git history through it. Open the shell on Archboard's model in a private headless Chromium, 1440x1080, in the light theme, beside a terminal.",
		`Film the Measures tab over a list that is already sorted by Unjoined, with ${BEATS.unjoined} selected: its Changes with section. Sort by Entries and select ${BEATS.shallow} by name: many entries and nothing hidden. Sort by Pass-through, select ${BEATS.passThrough} by name, and open its About page, where each entry that passes a call on names its target. The terminal reports the summary of archboard model locality.`,
		`Encode the take as a ${WIDTH} px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the second selection. Refuse a take that shows the home directory's path. No Codex session runs.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () => {
		const server = await startCheckoutServer("design-smells");
		await holding(server.stop, async () => {
			const browser = await Browser.start();
			await holding(
				async () => browser.close(),
				async () => film(server, browser),
			);
		});
	},
};

export { designSmells };
