// The banner: the lockup beside a real proposal that Archboard draws, in both themes, and the
// social card cut from the dark one.
//
// An Archboard server over a copy of examples/web-shop rasterizes the Web shop's Queued fulfilment
// proposal, drawn against the architecture that is built: new parts in green, a changed part in
// orange, and a removed part as a red ghost. A page in Chromium lays the drawing as a sheet on the
// theme's chrome, tilted away from the reader, and sets the lockup (lockup.ts) beside it. The page
// loads the theme's colours from src/shared/theme/theme.css and the display face from the
// repository. The same checkout makes the same banner.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

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
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { lockupMarkup } from "./lockup.ts";

/** The board and the proposal the banner shows. */
const BOARD = "Web shop";
const PROPOSAL = "Queued fulfilment";

/** The banner's size. The README shows it at its full width, and dark through the colour scheme. */
const BANNER = { width: 2172, height: 724 } as const;

/** GitHub's social preview: the banner's left 2:1, lockup included, at GitHub's size. */
const SOCIAL = { width: 1280, height: 640 } as const;

/** Bitmap pixels per diagram pixel: the near edge of the sheet is drawn larger than the diagram. */
const DRAWING_SCALE = 2;

/** The name's size in the lockup, in banner pixels; the mark follows it. */
const NAME_SIZE = 120;

/** The display face the name is set in. */
const DISPLAY_FACE = "src/ui/shell/assets/fonts/BigShouldersDisplay-wght.ttf";

/** The files it writes. */
const FILES = {
	dark: readmeFile("banner-dark.webp"),
	light: readmeFile("banner-light.webp"),
	social: "docs/assets/archboard-social-card.jpg",
} as const;

type Theme = "dark" | "light";

/** What `semantic rasterize` answers about the diagram it drew. */
const RasterReceiptSchema = z.object({
	diagram: z.object({ width: z.number(), height: z.number() }),
});

/** One theme's drawing of the proposal, and the diagram's size in diagram pixels. */
interface Drawing {
	readonly file: string;
	readonly width: number;
	readonly height: number;
}

/**
 * The address of a repository file, for the page.
 * @param path The file, from the repository root.
 * @returns Its file URL.
 */
function fileUrl(path: string): string {
	return pathToFileURL(inRepository(path)).toString();
}

/**
 * The banner of one theme, as a page. The chrome is the ground. The drawing lies on it as a sheet
 * in the picture's own ground, and the chrome's tone washes over the sheet's far edges, so the
 * left third stays calm for the lockup.
 * @param theme The theme.
 * @param drawing The proposal drawn in that theme.
 * @returns The page.
 */
function bannerPage(theme: Theme, drawing: Drawing): string {
	return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fileUrl("src/shared/theme/theme.css")}">
<style>
@font-face { font-family: "Archboard Display"; src: url("${fileUrl(DISPLAY_FACE)}") format("truetype"); font-weight: 100 900; font-display: block; }
:root { --shade: color-mix(in oklch, var(--foreground) 22%, transparent); }
:root[data-theme="dark"] { --shade: color-mix(in oklch, var(--sidebar) 25%, black); }
body { position: relative; margin: 0; width: ${BANNER.width}px; height: ${BANNER.height}px; overflow: hidden; background: var(--sidebar); }
.sheet { position: absolute; left: 900px; top: -10px; width: ${drawing.width}px; height: ${drawing.height}px; overflow: hidden;
	transform-origin: 0 0; transform: perspective(2400px) rotateX(48deg) rotateZ(-9deg) scale(0.74);
	border-radius: 8px; background: var(--background); box-shadow: 0 0 0 1px var(--border), 0 30px 70px -10px var(--shade); }
.sheet img { display: block; width: 100%; height: 100%; }
.falloff { position: absolute; inset: 0; background:
	linear-gradient(90deg, var(--sidebar) 34%, transparent 46%),
	radial-gradient(130% 150% at 60% 75%, transparent 55%, var(--sidebar) 100%); }
.lockup { position: absolute; left: 150px; top: 50%; transform: translateY(-50%); }
</style></head><body>
<div class="sheet"><img src="${pathToFileURL(drawing.file).toString()}"></div>
<div class="falloff"></div>
<div class="lockup">${lockupMarkup(NAME_SIZE)}</div>
</body></html>`;
}

/**
 * Rasterize the proposal, drawn against today, in one theme.
 * @param server The server over a copy of the example vault.
 * @param theme The theme.
 * @param work Where the drawing goes.
 * @returns The drawing.
 */
async function drawProposal(server: TakeServer, theme: Theme, work: string): Promise<Drawing> {
	const file = join(work, `drawing-${theme}.png`);
	const receipt = await server.cli([
		"semantic",
		"rasterize",
		BOARD,
		"--variant",
		PROPOSAL,
		"--theme",
		theme,
		"--scale",
		String(DRAWING_SCALE),
		"--out",
		file,
	]);
	return { file, ...RasterReceiptSchema.parse(receipt).diagram };
}

/**
 * Lay one theme's banner out in Chromium and save what it shows.
 * @param browser The browser.
 * @param theme The theme.
 * @param drawing The proposal drawn in that theme.
 * @param out Where the picture goes.
 */
async function photograph(
	browser: Browser,
	theme: Theme,
	drawing: Drawing,
	out: string,
): Promise<void> {
	const page = join(scratch("banner"), `${theme}.html`);
	writeFileSync(page, bannerPage(theme, drawing));
	const window = await browser.open({ url: pathToFileURL(page).toString(), theme, ...BANNER });
	await window.waitFor(
		"document.images[0]?.complete && document.images[0].naturalWidth > 0",
		"the drawing",
	);
	await window.evaluate(
		`document.fonts.load('500 ${NAME_SIZE}px "Archboard Display"').then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`,
	);
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
					context.say(`Drawing ${BOARD}'s ${PROPOSAL} proposal in ${theme}, beside the lockup.`);
					const picture = join(work, `banner-${theme}.png`);
					await photograph(browser, theme, await drawProposal(server, theme, work), picture);
					await ffmpeg([
						"-i",
						picture,
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
		`crop=${BANNER.height * 2}:${BANNER.height}:0:0,scale=${SOCIAL.width}:${SOCIAL.height}:flags=lanczos`,
		"-q:v",
		"2",
		inRepository(FILES.social),
	]);
}

const banner: Producer = {
	kind: "art",
	codex: false,
	files: [FILES.dark, FILES.light, FILES.social],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Start an Archboard server over a copy of examples/web-shop.",
		`Rasterize ${BOARD}'s ${PROPOSAL} proposal against today in dark and light with archboard semantic rasterize, at ${DRAWING_SCALE}x.`,
		`Lay each drawing as a tilted sheet beside the lockup (the mark from lockup.ts and archboard in the display face, in theme.css's colours) in Chromium at ${BANNER.width}x${BANNER.height}.`,
		`Encode each as a still WebP in docs/readme, and cut the dark banner's left 2:1 into the ${SOCIAL.width}x${SOCIAL.height} social card in docs/assets.`,
	],
	make: makeBanner,
};

export { banner };
