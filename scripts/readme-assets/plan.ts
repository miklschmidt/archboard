// Two independent recommendations proposals share one explicit planning root.

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
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { readModel, showModel } from "./model-authoring.ts";

const MODEL = "Shop";
const START = "Starting point";
const LEFT = "Nightly batch";
const RIGHT = "Live events";
const CLIP = attachmentFile("plan.webp");
const THUMBNAIL = readmeFile("idx-plan.webp");

const plan: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop, and open the shell on ${MODEL} in a private headless Chromium at 1920x1080, in the light theme.`,
		`Split the page into two panes with archboard browser open, show ${START} in both, fold the sidebars and fit.`,
		`Film archboard browser show putting ${LEFT} in the left pane and ${RIGHT} in the right one.`,
		`Encode the take as a 1440 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the right pane once its proposal is drawn.`,
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
			});
			await page.atRest();
			await server.cli(["browser", "open"]);
			await showModel(server, "plan", "A", { model: MODEL, state: START, against });
			await showModel(server, "plan", "B", { model: MODEL, state: START, against });
			await page.atRest(0);
			await page.atRest(1);
			await foldSidebars(page);
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
				const drawn = await moment(page, ["[data-slot='pane-stage'][data-pane='B']"], 960);
				await Bun.sleep(2000);
				return drawn;
			});
			await encodeTake(take, { clip: CLIP, width: 1440, thumbnail: THUMBNAIL });
		}),
};

export { plan };
