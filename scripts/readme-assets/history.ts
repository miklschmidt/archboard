// The history clip: one of Archboard's own boards walked through every state it has been, each
// drawn as it was (the comparison marks are off), over a timeline strip that names each state,
// the date it was adopted and the reason the board file records for it.

import type { SemanticBoard } from "@archboard/board/document";

import {
	encodeTake,
	filmTogether,
	inOrder,
	now,
	present,
	readBoard,
	attachmentFile,
	readmeFile,
	stageUrl,
	withTake,
	type Moment,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";

const BOARD = "Renderer layout";
const CLIP = attachmentFile("history.webp");
const THUMBNAIL = readmeFile("idx-history.webp");
const CLIP_WIDTH = 960;
const PANE = { width: 1440, height: 900 } as const;
const STRIP = { width: 1440, height: 180 } as const;

/** The thumbnail: the lower 16:9 part of the pane above the strip, which holds the strip. */
const LOWER_PART = { x: 0, y: PANE.height + STRIP.height - 810, width: 1440, height: 810 };

/** The longest reason the strip quotes whole. */
const LONGEST_QUOTE = 100;

/** One state of the board on the timeline. */
interface Stop {
	readonly id: string;
	readonly name: string;
	readonly lifecycle: string;
	readonly label: string;
	readonly why: string;
}

/**
 * A reason as the strip quotes it: whole, or cut at a word with an ellipsis.
 * @param reason The reason the board file records.
 * @returns The quotation.
 */
function quoted(reason: string): string {
	if (reason.length <= LONGEST_QUOTE) return `“${reason}”`;
	const cut = reason.slice(0, reason.lastIndexOf(" ", LONGEST_QUOTE));
	return `“${cut} …”`;
}

/**
 * The states of a board's history, in the order they were made: every historical variant and the
 * current one, each with its adoption.
 * @param board The board.
 * @returns The stops.
 */
function stopsOf(board: SemanticBoard): readonly Stop[] {
	return board.variants
		.filter((variant) => variant.lifecycle === "historical" || variant.lifecycle === "current")
		.map((variant) => {
			const adoption = (board.adoptions ?? []).find((adopted) => adopted.variant === variant.id);
			const day = adoption?.at.slice(0, 10);
			return {
				id: variant.id,
				name: variant.name,
				lifecycle: variant.lifecycle,
				label:
					day === undefined
						? `${variant.lifecycle} · the first state`
						: `${variant.lifecycle} · adopted ${day}`,
				why: adoption?.reason === undefined ? "" : quoted(adoption.reason),
			};
		});
}

const history: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of .archboard/vault, and read the states of "${BOARD}", their adoption dates and reasons with archboard semantic show.`,
		`Open the shell on the first state in a private headless Chromium at ${PANE.width}x${PANE.height}, dark, turn the comparison marks off and present the pane; open the timeline strip beside it at ${STRIP.width}x${STRIP.height}.`,
		"Film archboard browser show moving the pane to each later state while the strip lights it.",
		`Encode the pane above the strip as a ${CLIP_WIDTH} px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the second state.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("history", ".archboard/vault", false, async (server, browser) => {
			const stops = stopsOf(await readBoard(server, BOARD));
			const [first, next] = stops;
			if (first === undefined || next === undefined) {
				throw new Error(`${BOARD} has fewer than two states, so it has no history to show.`);
			}
			const strip = await browser.open({
				url: stageUrl("timeline.html", { theme: "dark" }),
				theme: "dark",
				...STRIP,
			});
			await strip.waitFor("window.ready === true", "the timeline page");
			await strip.evaluate(`window.timeline.set(${JSON.stringify(stops)}); window.timeline.go(0)`);
			const page = await browser.open({
				url: `${server.url}/?paneA=${encodeURIComponent(`${BOARD}@${first.id}`)}`,
				theme: "dark",
				...PANE,
			});
			await page.atRest();
			const marked = "[data-slot='semantic-comparison-toggle'][aria-checked='true']";
			await page.waitFor(
				`!!document.querySelector("[data-slot='semantic-comparison-toggle']")`,
				"the comparison control",
			);
			if (await page.evaluate(`!!document.querySelector("${marked}")`)) await page.click(marked);
			await present(page);
			await page.atRest();
			await Bun.sleep(1500);
			const take = await filmTogether("history", [page, strip], async () => {
				await Bun.sleep(2600);
				// The later states are shown one after another, the strip moving with the pane, and
				// each holds long enough to read. The thumbnail is the first of them.
				const shown = await inOrder(stops.slice(1), async (stop, index): Promise<Moment> => {
					await server.cli(["browser", "show", `${BOARD}@${stop.id}`, "--pane", "primary"]);
					await strip.evaluate(`window.timeline.go(${index + 1})`);
					await Bun.sleep(3800);
					return { at: now(), crop: LOWER_PART };
				});
				await Bun.sleep(600);
				return shown[0] ?? null;
			});
			await encodeTake(take, {
				clip: CLIP,
				width: CLIP_WIDTH,
				stack: "above",
				thumbnail: THUMBNAIL,
			});
		}),
};

export { history };
