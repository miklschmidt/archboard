// The design-smells clip: Archboard's own model, read in the Measures tab of the reader with this
// repository's real Git history. The terminal beside the shell summarizes `archboard model
// locality`. Nothing is canned: every count on the screen is read from the checkout.
//
// The clip is filmed over this checkout's vault in place, so it only reads. The code history of a
// year takes the server a few seconds, so the take reads it once before the camera runs: the
// browser keeps its answer, and the camera then films the Measures tab opening on a read list.

import { homedir } from "node:os";
import { z } from "zod";

import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";

import {
	Browser,
	Terminal,
	attachmentFile,
	encodeTake,
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
import { modelResult, readModel } from "./model-authoring.ts";

const CLIP = attachmentFile("design-smells.webp");
const THUMBNAIL = readmeFile("idx-design-smells.webp");
/** The shell beside the terminal. A pane under 900 px hides its Right panel until a selection. */
const PANE = { width: 1440, height: 1080 } as const;
const TERMINAL = { width: 480, path: "~/archboard" } as const;
const PANEL = "[data-slot='model-panel']";
/** How long the first read of a year of Git may take on the real history. */
const HISTORY_MS = 120_000;
/** The thumbnail: the top of the shell, above the agent dock, with the list and its Right panel. */
const STILL = { x: TERMINAL.width, y: 0, width: PANE.width, height: 810 } as const;

/** The counts of the first row of the list, by measure. */
const RowSchema = z.object({ id: z.string(), counts: z.record(z.string(), z.number()) });
/** The first row, with the name of its module. */
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
 * The first row of the list, with every count it shows.
 * @param page The shell.
 * @param names Every module's name, by identity.
 * @returns Its module's name and counts.
 * @throws {Error} When the model has no module of that identity.
 */
async function firstRow(page: Page, names: Names): Promise<Row> {
	const row = RowSchema.parse(
		await page.evaluate(`(() => {
			const row = document.querySelector("[data-measure-row]");
			if (row === null) return null;
			const counts = {};
			for (const cell of row.querySelectorAll("[data-measure][data-count]")) {
				counts[cell.getAttribute("data-measure")] = Number(cell.getAttribute("data-count"));
			}
			return { id: row.getAttribute("data-measure-row"), counts };
		})()`),
	);
	const name = names.get(row.id);
	if (name === undefined)
		throw new Error(`The list shows ${row.id}, which the model does not hold.`);
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
 * Select the first row of the list, and wait until the Right panel explains its module.
 * @param page The shell.
 * @param names Every module's name, by identity.
 * @returns The row.
 */
async function selectFirst(page: Page, names: Names): Promise<Row> {
	const row = await firstRow(page, names);
	await page.click("[data-measure-row]");
	await page.waitFor(
		`document.querySelector("${PANEL} [data-slot='module-details']")?.getAttribute("data-module-id") === ${JSON.stringify(row.id)}`,
		`${row.name} explained in the Right panel`,
	);
	await Bun.sleep(300);
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
 * Measures, wait for its read, and return to Modules.
 * @param server The take's server.
 * @param browser The private browser.
 * @param model The canonical model's identity.
 * @returns The page, on Modules with nothing selected.
 */
async function openReader(server: TakeServer, browser: Browser, model: string): Promise<Page> {
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
	await page.click("[data-destination='modules']");
	await page.moveTo({ x: 1000, y: 700 }, 1);
	await Bun.sleep(900);
	return page;
}

/**
 * Sort by Unjoined, select the first row, and let the Right panel show what changes with it.
 * @param page The shell.
 * @param terminal The filmed terminal.
 * @param names Every module's name, by identity.
 */
async function showUnjoined(page: Page, terminal: Terminal, names: Names): Promise<void> {
	await sortBy(page, "Unjoined");
	const row = await selectFirst(page, names);
	await shows(page, `${PANEL} [data-slot='model-panel-changes-with']`);
	const unjoined = words(row.counts["unjoined"] ?? 0, "module changes", "modules change");
	await terminal.say(`${row.name}: ${unjoined} with it and nothing joins them.`);
}

/**
 * Sort by Pass-through, select the first row, and let the Right panel show its interface.
 * @param page The shell.
 * @param terminal The filmed terminal.
 * @param names Every module's name, by identity.
 */
async function showPassThrough(page: Page, terminal: Terminal, names: Names): Promise<void> {
	await sortBy(page, "Pass-through");
	const row = await selectFirst(page, names);
	await shows(page, `${PANEL} [data-slot='model-panel-interface']`);
	const entries = words(row.counts["entryPoints"] ?? 0, "entry", "entries");
	await terminal.say(
		`${row.name}: ${entries}, ${row.counts["passThrough"] ?? 0} of them pass a call straight on.`,
	);
}

/**
 * Sort by Hidden, fewest first, over the modules that have parts, select the first row, and let
 * the Right panel show what it keeps to itself.
 * @param page The shell.
 * @param terminal The filmed terminal.
 * @param names Every module's name, by identity.
 */
async function showNothingHidden(page: Page, terminal: Terminal, names: Names): Promise<void> {
	await sortBy(page, "Hidden");
	await page.click("[data-slot='model-measure-order'] [data-choice='fewest']");
	await page.waitFor(
		"document.querySelector(\"[data-slot='model-measure-order'] [data-choice='fewest']\")?.getAttribute('aria-pressed') === 'true'",
		"fewest first",
	);
	await choose(page, "model-measure-show", "Modules with parts");
	await shows(page, "[data-slot='model-measures-shown']");
	await Bun.sleep(400);
	const row = await selectFirst(page, names);
	await shows(page, `${PANEL} [data-slot='model-panel-implementation']`);
	const hidden = row.counts["hiddenParts"] ?? 0;
	await terminal.say(
		hidden === 0
			? `${row.name} hides nothing behind its interface.`
			: `${row.name} keeps ${words(hidden, "part", "parts")} hidden behind its interface.`,
	);
}

/**
 * Film the three sorts, with the terminal reporting the locality of the checkout.
 * @param server The take's server.
 * @param browser The private browser.
 */
async function film(server: TakeServer, browser: Browser): Promise<void> {
	const model = await readModel(server);
	const names = new Map(model.modules.map((module) => [module.id, module.name]));
	const locality = await readLocality(server);
	const terminal = await Terminal.open(browser, "light", PANE.height, TERMINAL);
	const page = await openReader(server, browser, model.manifest.id);
	const take = await filmTogether("design-smells", [terminal.page, page], async () => {
		await Bun.sleep(500);
		await terminal.say(
			"Where does the design cost the most?\nArchboard's own model and this repository's Git history.",
		);
		await terminal.command("archboard model locality");
		await terminal.done(...localityLines(locality));
		await page.click("[data-destination='measures']");
		await page.waitFor("document.querySelector('[data-measure-row]') !== null", "the list");
		await Bun.sleep(800);
		await showUnjoined(page, terminal, names);
		const still: Moment = { at: now(), crop: STILL };
		await Bun.sleep(1600);
		await showPassThrough(page, terminal, names);
		await Bun.sleep(1600);
		await showNothingHidden(page, terminal, names);
		await Bun.sleep(2200);
		await requireNoHomePath([terminal.page, page]);
		return still;
	});
	await encodeTake(take, { clip: CLIP, width: 1440, thumbnail: THUMBNAIL });
}

const designSmells: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Start an Archboard server over this checkout's own vault, in place and read only, and read a year of this repository's Git history through it. Open the shell on Archboard's model in a private headless Chromium, 1440x1080, in the light theme, beside a terminal.",
		"Film the Measures tab: sort by Unjoined and select the first row for its Changes with section; sort by Pass-through and select the first row for its interface; sort by Hidden, fewest first, over the modules with parts, and select the first row. The terminal reports the summary of archboard model locality.",
		`Encode the take as a 1440 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the first selection. Refuse a take that shows the home directory's path. No Codex session runs.`,
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
