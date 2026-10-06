// The drill-down clip: the pointer rests on a part that has a board of its own until its tip
// offers to open it, a double-click dives into that board, and the breadcrumb leads back.

import {
	encodeTake,
	filmTogether,
	fit,
	foldSidebars,
	moment,
	attachmentFile,
	readmeFile,
	withTake,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./kit.ts";

const BOARD = "Web shop";
const PART = "Inventory service";
const TIP = "[data-slot='semantic-subject-tip']";
const CLIP = attachmentFile("drill-down.webp");
const THUMBNAIL = readmeFile("idx-drill.webp");

const drillDown: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop, and open the shell on ${BOARD} in a private headless Chromium at 1920x1080, in the light theme.`,
		"Fold the sidebar and fit the picture to the pane.",
		`Film the pointer resting on ${PART} until its tip offers to open its board, a double-click into that board, and the breadcrumb back to ${BOARD}.`,
		`Encode the take as a 1440 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the moment the tip shows.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("drill-down", "examples/web-shop", false, async (server, browser) => {
			const page = await browser.open({
				url: `${server.url}/?paneA=${encodeURIComponent(BOARD)}`,
				theme: "light",
				cursor: true,
			});
			await page.atRest();
			await foldSidebars(page);
			await fit(page);
			await page.atRest();
			await page.moveTo({ x: 1500, y: 900 }, 1);
			const take = await filmTogether("drill-down", [page], async () => {
				await Bun.sleep(1200);
				const card = await page.card(PART);
				await page.moveTo(await page.centreOf(card), 40);
				await page.waitFor(`!!document.querySelector("${TIP}")`, `the tip of ${PART}`);
				await Bun.sleep(1200);
				const tip = await moment(page, [card, TIP], 960);
				await Bun.sleep(500);
				await page.doubleClick(card);
				await Bun.sleep(900);
				await page.atRest();
				await Bun.sleep(3000);
				await page.click("[data-slot='pane-crumb']");
				await Bun.sleep(900);
				await page.atRest();
				await Bun.sleep(1800);
				return tip;
			});
			await encodeTake(take, { clip: CLIP, width: 1440, thumbnail: THUMBNAIL });
		}),
};

export { drillDown };
