// The banner: the lockup beside a real proposal that Archboard draws, in both themes, and the
// social card cut from the dark one.
//
// An Archboard server over a copy of examples/web-shop renders the Web shop's Queued fulfilment
// proposal as an SVG, drawn against the architecture that is built: new parts in green, a changed
// part in orange, and a removed part as a red ghost. A page in Chromium puts that SVG in as vector,
// a sheet tilted away from the reader, and sets the lockup (lockup.ts) beside it. The ground of the
// page is the ground of GitHub's page in the colour mode of the banner, and the drawing is given
// the same ground, so the banner shows no edge where it lies on the README. The page loads the
// theme's colours from the renderer package's theme.css and the display face from its fonts. It is
// photographed at two pixels per CSS pixel and scaled down, so the tilt is sampled finely. Repeated
// makes agree to within a few anti-aliased pixels of the tilted sheet, not byte for byte.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { DIAGRAM_FONTS_DIRECTORY, THEME_STYLESHEET } from "@archboard/renderer/assets";

import {
	Browser,
	ffmpeg,
	holding,
	inOrder,
	inRepository,
	readmeFile,
	scratch,
	startServer,
	type MakeContext,
	type Producer,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { lockupMarkup } from "./lockup.ts";

/** The board and the proposal the banner shows. */
const MODEL = "Shop";
const PROPOSAL = "Queued fulfilment";

/** The banner's size. The README shows it at its full width, and dark through the colour scheme. */
const BANNER = { width: 2172, height: 724 } as const;

/** GitHub's social preview: the banner's left 2:1, lockup included, at GitHub's size. */
const SOCIAL = { width: 1280, height: 640 } as const;

/** Device pixels per CSS pixel of the page, so the tilted drawing is sampled finely. */
const PIXEL_RATIO = 2;

/** The name's size in the lockup, in banner pixels; the mark follows it. */
const NAME_SIZE = 120;

/** The display face the name is set in. */
const DISPLAY_FACE = join(DIAGRAM_FONTS_DIRECTORY, "BigShouldersDisplay-wght.ttf");

/** The files it writes. */
const FILES = {
	dark: readmeFile("banner-dark.webp"),
	light: readmeFile("banner-light.webp"),
	social: "docs/assets/archboard-social-card.jpg",
} as const;

type Theme = "dark" | "light";

/** The ground of GitHub's page in each of its colour modes (Primer's default background). */
const GROUND: Readonly<Record<Theme, string>> = { dark: "#0d1117", light: "#ffffff" };

/** What the page says once its drawing and its faces are ready. */
const PageReadySchema = z.object({ failed: z.array(z.string()), display: z.boolean() });

/**
 * The page script that makes the picture ready: leave the traffic marks at their first frame by
 * removing their animation (none begins later than time zero, so the first frame is the picture
 * without it), and load every face that the page and the drawing declare.
 */
const READY_SCRIPT = `(async () => {
	const svg = document.querySelector(".sheet svg");
	svg.querySelectorAll("animate, animateTransform, animateMotion, set").forEach((animation) => animation.remove());
	const faces = [...document.fonts];
	await Promise.all(faces.map((face) => face.load().catch(() => undefined)));
	await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	return {
		failed: faces.filter((face) => face.status !== "loaded").map((face) => face.family),
		display: faces.some((face) => face.family.includes("Archboard Display") && face.status === "loaded"),
	};
})()`;

/**
 * The banner of one theme, as a page. GitHub's ground is the ground of the whole banner and of the
 * drawing, so nothing marks where the sheet ends. The drawing lies on it as a tilted sheet, and the
 * ground washes over the sheet's far edges, so the left third stays calm for the lockup.
 * @param theme The theme.
 * @param drawing The SVG that the renderer drew in that theme.
 * @returns The page.
 */
function bannerPage(theme: Theme, drawing: string): string {
	return `<!doctype html><html data-theme="${theme}" style="--ground: ${GROUND[theme]}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(THEME_STYLESHEET).toString()}">
<style>
@font-face { font-family: "Archboard Display"; src: url("${pathToFileURL(DISPLAY_FACE).toString()}") format("truetype"); font-weight: 100 900; font-display: block; }
body { position: relative; margin: 0; width: ${BANNER.width}px; height: ${BANNER.height}px; overflow: hidden; background: var(--ground); }
.sheet { position: absolute; left: 900px; top: -10px; line-height: 0;
	transform-origin: 0 0; transform: perspective(2400px) rotateX(48deg) rotateZ(-9deg) scale(0.74); }
.sheet svg { display: block; --background: var(--ground) !important; }
.falloff { position: absolute; inset: 0; background:
	linear-gradient(90deg, var(--ground) 34%, transparent 46%),
	radial-gradient(130% 150% at 60% 75%, transparent 55%, var(--ground) 100%); }
.lockup { position: absolute; left: 150px; top: 50%; transform: translateY(-50%); }
</style></head><body>
<div class="sheet">${drawing}</div>
<div class="falloff"></div>
<div class="lockup">${lockupMarkup(NAME_SIZE)}</div>
</body></html>`;
}

/**
 * Render the proposal, drawn against today, in one theme.
 * @param server The server over a copy of the example vault.
 * @param theme The theme.
 * @param work Where the drawing goes.
 * @returns The SVG.
 */
async function drawProposal(server: TakeServer, theme: Theme, work: string): Promise<string> {
	const file = join(work, `drawing-${theme}.svg`);
	await server.cli(["model", "render", "--state", PROPOSAL, "--theme", theme, "--out", file]);
	return readFileSync(file, "utf8");
}

/**
 * Lay one theme's banner out in Chromium and save what it shows.
 * @param browser The browser.
 * @param theme The theme.
 * @param drawing The SVG that the renderer drew in that theme.
 * @param out Where the picture goes.
 * @throws {Error} When a face did not load, so the banner would be photographed in another face.
 */
async function photograph(
	browser: Browser,
	theme: Theme,
	drawing: string,
	out: string,
): Promise<void> {
	const page = join(scratch("banner"), `${theme}.html`);
	writeFileSync(page, bannerPage(theme, drawing));
	const window = await browser.open({
		url: pathToFileURL(page).toString(),
		theme,
		pixelRatio: PIXEL_RATIO,
		...BANNER,
	});
	await window.waitFor('document.querySelector(".sheet svg") !== null', "the drawing");
	const ready = PageReadySchema.parse(await window.evaluate(READY_SCRIPT));
	if (ready.failed.length > 0 || !ready.display) {
		throw new Error(
			`The banner page did not load every face (${ready.failed.join(", ") || "no Archboard Display"}).`,
		);
	}
	await window.screenshot(out);
}

/**
 * Draw the proposal and lay out the banner in each theme, encode both, and cut the social card.
 * @param context What the producer is given.
 */
async function makeBanner(context: MakeContext): Promise<void> {
	const work = scratch("banner");
	const server = await startServer("banner", "examples/web-shop", false);
	await holding(server.stop, async () => {
		const browser = await Browser.start();
		await holding(
			async () => browser.close(),
			async () =>
				inOrder(["dark", "light"] as const, async (theme) => {
					context.say(`Drawing ${MODEL}'s ${PROPOSAL} proposal in ${theme}, beside the lockup.`);
					const picture = join(work, `banner-${theme}.png`);
					await photograph(browser, theme, await drawProposal(server, theme, work), picture);
					await ffmpeg([
						"-i",
						picture,
						"-vf",
						`scale=${BANNER.width}:${BANNER.height}:flags=lanczos`,
						"-c:v",
						"libwebp",
						"-quality",
						"90",
						inRepository(FILES[theme]),
					]);
				}),
		);
	});
	await ffmpeg([
		"-i",
		join(work, "banner-dark.png"),
		"-vf",
		`crop=${BANNER.height * 2 * PIXEL_RATIO}:${BANNER.height * PIXEL_RATIO}:0:0,scale=${SOCIAL.width}:${SOCIAL.height}:flags=lanczos`,
		"-q:v",
		"2",
		inRepository(FILES.social),
	]);
}

const banner: Producer = {
	kind: "art",
	codex: false,
	files: [FILES.dark, FILES.light, FILES.social],
	attachments: [],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Start an Archboard server over a copy of examples/web-shop.",
		`Render ${MODEL}'s ${PROPOSAL} proposal against today in dark and light with archboard model render.`,
		`Lay each SVG as a tilted sheet beside the lockup (the mark from lockup.ts and archboard in the display face, in theme.css's colours) on GitHub's ground for that colour mode, in Chromium at ${BANNER.width}x${BANNER.height} and ${PIXEL_RATIO} pixels per CSS pixel.`,
		`Scale each picture down and encode it as a still WebP in docs/readme, and cut the dark banner's left 2:1 into the ${SOCIAL.width}x${SOCIAL.height} social card in docs/assets.`,
	],
	make: makeBanner,
};

export { banner };
