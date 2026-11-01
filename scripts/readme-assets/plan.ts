// Two independent recommendations proposals share one explicit planning root.

import {
	encodeTake,
	filmTogether,
	fit,
	moment,
	attachmentFile,
	readmeFile,
	withTake,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { readModel, showModel } from "./model-authoring.ts";

const MODEL = "Shop";
const START = "Starting point";
const LEFT = "Nightly batch";
const RIGHT = "Live events";
/**
 * A shell wider than 1920 px. At 1920 px each of the two panes is 735 px wide: a pane's header cuts
 * its state's name to a few letters and its picture's labels are a few pixels high. The clip films
 * wider, and encodes at the width it films, so that its pictures are drawn larger.
 */
const SHELL = { width: 2560, height: 1080 } as const;
const CLIP = attachmentFile("plan.webp");
const THUMBNAIL = readmeFile("idx-plan.webp");

const plan: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop, and open the shell on ${MODEL} in a private headless Chromium at 2560x1080, in the light theme.`,
		`Split the page into two panes with archboard browser open, show ${START} in both and fit.`,
		`Film archboard browser show putting ${LEFT} in the left pane and ${RIGHT} in the right one.`,
		`Encode the take as a 2560 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} around the cards of the right pane once its proposal is drawn.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("plan", "examples/web-shop", false, async (server, browser) => {
			const against = (await readModel(server, START)).selectedState!.id;
			const page = await browser.open({
				url: `${server.url}/?modelA=${MODEL}&stateA=${encodeURIComponent(START)}&againstA=${against}`,
				theme: "light",
				cursor: true,
				...SHELL,
			});
			await page.atRest();
			await server.cli(["browser", "open"]);
			await showModel(server, "plan", "A", { model: MODEL, state: START, against });
			await showModel(server, "plan", "B", { model: MODEL, state: START, against });
			await page.atRest(0);
			await page.atRest(1);
			await fit(page);
			await Bun.sleep(1200);
			const take = await filmTogether("plan", [page], async () => {
				await Bun.sleep(1600);
				await showModel(server, "plan", "A", { model: MODEL, state: LEFT, against });
				await Bun.sleep(900);
				await page.atRest(0);
				await Bun.sleep(2600);
				await showModel(server, "plan", "B", { model: MODEL, state: RIGHT, against });
				await Bun.sleep(900);
				await page.atRest(1);
				await fit(page);
				await Bun.sleep(1200);
				const drawn = await moment(
					page,
					["[data-slot='pane-stage'][data-pane='B'] [data-semantic-kind='node']"],
					960,
				);
				await Bun.sleep(2000);
				return drawn;
			});
			await encodeTake(take, { clip: CLIP, width: SHELL.width, thumbnail: THUMBNAIL });
		}),
};

export { plan };
