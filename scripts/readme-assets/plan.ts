// The planning clip: a board nobody has built, opened in two panes on its starting point. An
// agent shows one competing proposal in each pane, through the CLI, and each pane redraws as its
// proposal, marked against the shared starting point.

import {
	encodeTake,
	filmTogether,
	fit,
	foldSidebars,
	moment,
	readmeFile,
	withTake,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./kit.ts";

const BOARD = "Recommendations";
const START = "Starting point";
const LEFT = "Nightly batch";
const RIGHT = "Live events";
const CLIP = readmeFile("plan.webp");
const THUMBNAIL = readmeFile("idx-plan.webp");

const plan: Producer = {
	kind: "clip",
	codex: false,
	files: [CLIP, THUMBNAIL],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop, and open the shell on ${BOARD} in a private headless Chromium at 1920x1080, in the light theme.`,
		`Split the page into two panes with archboard browser open, show ${START} in both, fold the sidebars and fit.`,
		`Film archboard browser show putting ${LEFT} in the left pane and ${RIGHT} in the right one.`,
		`Encode the take as a 1440 px WebP at 30 frames a second, and cut ${THUMBNAIL} from the right pane once its proposal is drawn.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("plan", "examples/web-shop", false, async (server, browser) => {
			const page = await browser.open({
				url: `${server.url}/?paneA=${encodeURIComponent(BOARD)}`,
				theme: "light",
				cursor: true,
			});
			await page.atRest();
			await server.cli(["browser", "open"]);
			await server.cli(["browser", "show", `${BOARD}@${START}`, "--pane", "left"]);
			await server.cli(["browser", "show", `${BOARD}@${START}`, "--pane", "right"]);
			await page.atRest(0);
			await page.atRest(1);
			await foldSidebars(page);
			await fit(page);
			await Bun.sleep(1200);
			const take = await filmTogether("plan", [page], async () => {
				await Bun.sleep(1600);
				await server.cli(["browser", "show", `${BOARD}@${LEFT}`, "--pane", "left"]);
				await Bun.sleep(900);
				await page.atRest(0);
				await Bun.sleep(2600);
				await server.cli(["browser", "show", `${BOARD}@${RIGHT}`, "--pane", "right"]);
				await Bun.sleep(900);
				await page.atRest(1);
				await fit(page);
				await Bun.sleep(1200);
				const drawn = await moment(page, ["[data-slot='pane-stage'][data-pane='B']"], 960);
				await Bun.sleep(2000);
				return drawn;
			});
			await encodeTake(take, { clip: CLIP, width: 1440, thumbnail: THUMBNAIL });
		}),
};

export { plan };
