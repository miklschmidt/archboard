// Open a service, open its API module, and return through the canonical containment path.

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

const MODEL = "Shop";
const PART = "Inventory service";
const CLIP = attachmentFile("drill-down.webp");
const THUMBNAIL = readmeFile("idx-drill.webp");

const drillDown: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop, and open the shell on ${MODEL} in a private headless Chromium at 1920x1080, in the light theme.`,
		"Fold the sidebar and fit the picture to the pane.",
		`Open ${PART}, open its Stock API module, then return to ${MODEL} through the module path.`,
		`Encode the take as a 1440 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, and cut ${THUMBNAIL} from the open inventory implementation.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("drill-down", "examples/web-shop", false, async (server, browser) => {
			const page = await browser.open({
				url: `${server.url}/?modelA=${MODEL}`,
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
				await page.doubleClick(card);
				await page.waitFor(
					`new URL(location.href).searchParams.get('scopeA') === 'Shop/MKhTEYqf#HYDbL5fE'`,
					"the inventory module scope",
				);
				await Bun.sleep(900);
				await page.atRest();
				const detail = await moment(page, ["[data-slot='model-diagram']"], 960);
				await Bun.sleep(2000);
				await page.doubleClick(await page.card("Stock API"));
				await page.waitFor(
					`new URL(location.href).searchParams.get('scopeA') === 'Shop/5IZTN4RT#1tJdSOqs'`,
					"the stock API module scope",
				);
				await page.atRest();
				await Bun.sleep(2000);
				await page.click("[data-slot='model-breadcrumbs'] [data-scope-id='']");
				await Bun.sleep(900);
				await page.atRest();
				await Bun.sleep(1800);
				return detail;
			});
			await encodeTake(take, { clip: CLIP, width: 1440, thumbnail: THUMBNAIL });
		}),
};

export { drillDown };
