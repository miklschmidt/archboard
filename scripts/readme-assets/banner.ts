// The banner and the social card: the marketing site's hero table, with the lockup beside it or
// above it, on the site's ground. The social card also sets a line in its lower right corner.
//
// The site's hero (site/src/scripts/hero) lays Archboard's drawing of the site's own model on a
// table in perspective. It raises each card as a tile and draws each line as a beam of light. The
// kit's page stage/banner.html runs that same code beside the lockup (lockup.ts). Vite serves the
// page from the checkout, because the hero's modules import their painting as a URL and load the
// painter's WebAssembly. The page asks for reduced motion, so the table draws its finished entry in
// one still frame. Chromium draws the table's WebGL2 with SwiftShader on the CPU, so a make needs
// no GPU. Each picture is taken at two pixels per CSS pixel and scaled down.
//
// The site paints the hero's picture with `bun site/scripts/paint.ts`, which needs the renderer
// core that `bun run build` makes. The kit builds before it makes an asset that needs Chromium,
// and this producer paints before it starts the page.

import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { z } from "zod";

import { coreSourceHash } from "@archboard/renderer/core";

import {
	Browser,
	ffmpeg,
	holding,
	inOrder,
	inRepository,
	readmeFile,
	run,
	scratch,
	type MakeContext,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { ROOT } from "./tools.ts";

/** A box on the page, in CSS pixels. */
interface Box {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/** Where one picture puts the table and the lockup. stage/banner.html reads it. */
interface Layout {
	/** The page's size, in CSS pixels. */
	readonly width: number;
	readonly height: number;
	/**
	 * Where the table's canvas lies. The table fits the picture into a fixed part of its canvas. It
	 * centres the picture across it, at most 0.94 of its width. Under words, it puts the picture from
	 * a tenth of the canvas's height up to a little above the words' foot. With no words, the picture
	 * goes from a tenth up to 0.55 of the height.
	 */
	readonly canvas: Box;
	/** The lockup: its left edge and its vertical middle, and the name's font size. */
	readonly lockup: { readonly left: number; readonly middle: number; readonly size: number };
	/**
	 * A line in the lower right corner, set as the site sets its headline: its text, which breaks
	 * where it holds a newline, its font size, and how far it stands from the right and bottom edges.
	 * The table neither fits the picture around it nor darkens the picture behind it.
	 */
	readonly line: {
		readonly text: string;
		readonly size: number;
		readonly right: number;
		readonly bottom: number;
	} | null;
	/** How far the canvas fades in from its left edge and up from its foot, as shares of it. */
	readonly fade: { readonly left: number; readonly foot: number };
	/**
	 * Whether the lockup stands above the table as the hero's words do. The table then fits the
	 * picture under it and darkens the picture behind it.
	 */
	readonly above: boolean;
}

/**
 * The README's banner, 3:1: the lockup at the left, the table at the right. The canvas runs above
 * the banner so that its picture, which takes no words, falls into the banner's middle. The canvas
 * is wider than tall, so the table fits the picture by its height and leaves room at each side
 * for the routes past the outermost cards. It fades in at its left, where it meets the lockup, and
 * at its foot, above the banner's bottom edge.
 */
const BANNER: Layout = {
	width: 2172,
	height: 724,
	canvas: { left: 637, top: -313, width: 1560, height: 1000 },
	lockup: { left: 150, middle: 362, size: 120 },
	line: null,
	fade: { left: 0.12, foot: 0.1 },
	above: false,
};

/**
 * GitHub's social preview and the site's link preview, 2:1: the site's hero in small. The lockup
 * stands where the hero's words stand, and the table fills the card under it. Where the card ends,
 * the table's own edge fades it into the ground. The line in the lower right corner says what the
 * check catches, because the page's title already says what Archboard is for. It stands on the
 * ground below the table's right half.
 */
const SOCIAL: Layout = {
	width: 1280,
	height: 640,
	canvas: { left: 0, top: 0, width: 1280, height: 640 },
	lockup: { left: 80, middle: 112, size: 96 },
	line: {
		text: "Catch the calls your\narchitecture doesn’t allow.",
		size: 44,
		right: 80,
		bottom: 56,
	},
	fade: { left: 0, foot: 0 },
	above: true,
};

/** Device pixels per CSS pixel of the page, so the table is drawn finely before it is scaled down. */
const PIXEL_RATIO = 2;

/** How long the page may take to paint the picture and draw it, in milliseconds. */
const DRAW_MS = 120_000;

/** The files it writes. */
const FILES = {
	banner: readmeFile("banner.webp"),
	social: "docs/assets/archboard-social-card.jpg",
} as const;

/** How the page's picture went, and which faces did not load. */
const DrawnSchema = z.object({ painted: z.string(), display: z.boolean() });

/** An expression that is true once the page painted the picture and drew it, or gave up. */
const DRAWN_EXPRESSION = `(() => {
	const painted = document.body.dataset.painted;
	if (painted === undefined) return false;
	return painted !== "true" || document.querySelector("[data-table]").classList.contains("is-live");
})()`;

/** The page script that waits for the drawn frame to reach the screen and reports what loaded. */
const DRAWN_SCRIPT = `(async () => {
	await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
	return {
		painted: document.body.dataset.painted,
		display: [...document.fonts].some((face) => face.family.includes("Archboard Display") && face.status === "loaded"),
	};
})()`;

/** What to do when the page did not draw the picture, by what it said. */
const RECOVERY: Readonly<Record<string, string>> = {
	failed:
		"The painter did not paint the hero's picture. Run `bun run build` inside `nix develop`, then `bun site/scripts/paint.ts`, and make the banner again.",
	"no-webgl":
		"Chromium offered no WebGL2. The kit starts it with --enable-unsafe-swiftshader; check that the Chromium in ARCHBOARD_RENDERER_CHROMIUM or on PATH supports SwiftShader.",
};

/**
 * Serve the checkout to the page with Vite. It watches no files and discovers no dependencies,
 * because the checkout holds the skill evaluations' preserved worlds, which nothing may walk.
 * @returns The server.
 */
async function serveCheckout(): Promise<ViteDevServer> {
	const server = await createServer({
		root: ROOT,
		configFile: false,
		logLevel: "error",
		clearScreen: false,
		server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
		optimizeDeps: { noDiscovery: true, include: [], entries: [] },
		// The painter refuses a build of other sources than the checkout holds.
		define: { ARCHBOARD_CORE_SOURCE_HASH: JSON.stringify(coreSourceHash()) },
	});
	await server.listen();
	return server;
}

/**
 * Lay out one picture in Chromium and save what it shows.
 * @param browser The browser.
 * @param origin Where Vite serves the checkout.
 * @param layout The layout.
 * @param out Where the picture goes.
 * @throws {Error} When the page did not draw the picture, or the display face did not load.
 */
async function photograph(
	browser: Browser,
	origin: string,
	layout: Layout,
	out: string,
): Promise<void> {
	const url = new URL("scripts/readme-assets/stage/banner.html", origin);
	url.searchParams.set("layout", JSON.stringify(layout));
	const window = await browser.open({
		url: url.toString(),
		theme: "dark",
		pixelRatio: PIXEL_RATIO,
		reducedMotion: true,
		width: layout.width,
		height: layout.height,
	});
	await window.waitFor(DRAWN_EXPRESSION, "the hero's table", DRAW_MS);
	const drawn = DrawnSchema.parse(await window.evaluate(DRAWN_SCRIPT));
	if (drawn.painted !== "true") {
		throw new Error(RECOVERY[drawn.painted] ?? `The page said ${drawn.painted}.`);
	}
	if (!drawn.display) throw new Error("The banner page did not load Archboard Display.");
	await window.screenshot(out);
}

/**
 * Paint the hero's picture, photograph the banner and the social card, and encode them.
 * @param context What the producer is given.
 */
async function makeBanner(context: MakeContext): Promise<void> {
	const work = scratch("banner");
	context.say("Painting the site's pictures with bun site/scripts/paint.ts.");
	await run([process.execPath, "site/scripts/paint.ts"]);
	const server = await serveCheckout();
	const origin = server.resolvedUrls?.local[0];
	await holding(
		async () => server.close(),
		async () => {
			if (origin === undefined) throw new Error("Vite did not say where it serves the checkout.");
			const browser = await Browser.start({ webgl: true });
			await holding(
				async () => browser.close(),
				async () =>
					inOrder(["banner", "social"] as const, async (name) => {
						const layout = name === "banner" ? BANNER : SOCIAL;
						context.say(`Drawing the hero's table for the ${name}.`);
						await photograph(browser, origin, layout, join(work, `${name}.png`));
					}),
			);
		},
	);
	// Lossy WebP keeps colour at half resolution, which leaves rings in the dark ground.
	await ffmpeg([
		"-i",
		join(work, "banner.png"),
		"-vf",
		`scale=${BANNER.width}:${BANNER.height}:flags=lanczos`,
		"-c:v",
		"libwebp",
		"-lossless",
		"1",
		"-compression_level",
		"6",
		inRepository(FILES.banner),
	]);
	await ffmpeg([
		"-i",
		join(work, "social.png"),
		"-vf",
		`scale=${SOCIAL.width}:${SOCIAL.height}:flags=lanczos`,
		"-q:v",
		"2",
		inRepository(FILES.social),
	]);
}

const banner: Producer = {
	kind: "art",
	codex: false,
	files: [FILES.banner, FILES.social],
	attachments: [],
	needs: ["chromium", "ffmpeg"],
	plan: [
		"Paint the site's pictures with bun site/scripts/paint.ts.",
		"Serve the checkout with Vite, and open stage/banner.html, which runs the site's hero table, in Chromium with SwiftShader's WebGL2 and reduced motion.",
		`Draw the banner, ${BANNER.width}x${BANNER.height} with the lockup beside the table, and the social card, ${SOCIAL.width}x${SOCIAL.height} with the lockup above it and the line in its lower right corner, at ${PIXEL_RATIO} pixels per CSS pixel.`,
		"Scale each picture down. Encode the banner as a lossless still WebP in docs/readme and the social card as a JPEG in docs/assets.",
	],
	make: makeBanner,
};

export { banner };
