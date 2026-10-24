// The README's diagrams: SVGs drawn by `archboard semantic render`, in light and dark, each with
// its embedded faces cut down to the characters it draws, so the page stays light. The same board
// gives the same bytes. An index thumbnail of one of them is a region rasterized by `archboard
// semantic rasterize` and encoded as a still WebP.
//
// A diagram of this checkout's own vault is a tracked embed (ADR 0057): it is drawn in place with
// `--track`, so its board lists it, and it keeps its render recipe, which `archboard check` reads
// to say when the board or the renderer draws it differently. Cutting the faces keeps the recipe,
// and the recipe's picture digest is of the drawing before the cut, so a cut file still compares.
// A diagram of examples/web-shop is drawn from a copy: that example is no vault in place (in a Git
// checkout only `<root>/.archboard/vault` is one), so no check can find its board, and the kit
// leaves its recipe out. The manifest's source hash says when it is stale.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import {
	encodeThumbnail,
	holding,
	inOrder,
	inRepository,
	pyftsubsetCommand,
	readmeFile,
	run,
	scratch,
	startCheckoutServer,
	startServer,
	type Producer,
	type TakeServer,
	type TrackedVault,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";

/** One README diagram, drawn in both themes. */
interface DiagramSpec {
	/** The asset's name, which is also the stem of its two files. */
	readonly name: string;
	readonly vault: TrackedVault;
	readonly board: string;
	/** The board's view to draw through; the whole variant when absent. */
	readonly view?: string;
	/** An index thumbnail cut from the picture: its file, its theme, and the region's width. */
	readonly thumbnail?: {
		readonly file: string;
		readonly theme: "light" | "dark";
		/** The width of the 16:9 region, in diagram pixels; it starts at the picture's top left. */
		readonly width: number;
	};
}

/** What `semantic render` answers about the picture it drew. */
const RenderReceiptSchema = z.object({ width: z.number(), height: z.number() });

/**
 * The code points of a text, each as a string. A face maps code points to glyphs, so a subset is
 * stated in code points rather than in the characters a reader sees: a combining mark keeps its
 * own glyph.
 * @param text The text.
 * @returns Its code points, in order.
 */
function codePoints(text: string): readonly string[] {
	return Array.from(text);
}

/** Characters every face keeps, whether or not the picture draws them. */
const KEPT_CHARACTERS = [
	...Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCodePoint(0x20 + index)),
	...codePoints("…·—–→←↑↓×’‘“”"),
];

/** The XML entities a picture's text can hold. */
const ENTITIES: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

/**
 * The text of an XML document, entities read.
 * @param xml The markup, tags already removed.
 * @returns The text.
 */
function unescapeXml(xml: string): string {
	return xml.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity: string, body: string) => {
		if (body.startsWith("#x") || body.startsWith("#X")) {
			return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
		}
		if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
		return ENTITIES[body] ?? entity;
	});
}

/** The element that holds an SVG's render recipe. */
const RECIPE_ELEMENT = /<metadata><archboard:render-recipe[\s\S]*?<\/metadata>/;

/**
 * Cut each face an SVG embeds down to the characters it draws. Every other byte stays, the
 * render recipe included.
 * @param svg The SVG `semantic render` wrote.
 * @param work A directory for the faces.
 * @returns The smaller SVG.
 */
async function subsetFaces(svg: string, work: string): Promise<string> {
	const faces = [...svg.matchAll(/url\("data:font\/ttf;base64,([A-Za-z0-9+/=]+)"\)/g)].map(
		(match) => match[1] ?? "",
	);
	const text = unescapeXml(svg.replaceAll(/@font-face\{[^}]*\}/g, "").replaceAll(/<[^>]+>/g, " "));
	const characters = join(work, "characters.txt");
	const kept = new Set([...codePoints(text), ...KEPT_CHARACTERS]);
	writeFileSync(characters, [...kept].toSorted().join(""));
	// One subsetter at a time keeps the machine quiet.
	const cuts = await inOrder(faces, async (face, index) => {
		const whole = join(work, `face-${index}.ttf`);
		const cut = join(work, `face-${index}.subset.ttf`);
		writeFileSync(whole, Buffer.from(face, "base64"));
		await run([
			...pyftsubsetCommand(),
			whole,
			`--text-file=${characters}`,
			`--output-file=${cut}`,
			"--layout-features=*",
			"--no-hinting",
			"--desubroutinize",
		]);
		return readFileSync(cut).toString("base64");
	});
	return faces.reduce((picture, face, index) => picture.replace(face, cuts[index] ?? face), svg);
}

/**
 * The CLI arguments that pick what the diagram draws.
 * @param spec The diagram.
 * @returns The board and its view.
 */
function subjectArguments(spec: DiagramSpec): readonly string[] {
	return [spec.board, ...(spec.view === undefined ? [] : ["--view", spec.view])];
}

/**
 * Rasterize the thumbnail's region of the picture and encode it.
 * @param spec The diagram.
 * @param server The take's server.
 * @param size The picture's size, as `semantic render` reported it.
 * @param work A directory for the bitmap.
 */
async function thumbnail(
	spec: DiagramSpec,
	server: TakeServer,
	size: z.infer<typeof RenderReceiptSchema>,
	work: string,
): Promise<void> {
	const cut = spec.thumbnail;
	if (cut === undefined) return;
	const width = Math.min(cut.width, size.width, Math.floor((size.height * 16) / 9));
	const height = Math.round((width * 9) / 16);
	const bitmap = join(work, "thumbnail.png");
	await server.cli([
		"semantic",
		"rasterize",
		...subjectArguments(spec),
		"--no-legend",
		"--theme",
		cut.theme,
		"--region",
		`0,0,${width},${height}`,
		"--out",
		bitmap,
	]);
	await encodeThumbnail(
		{ images: [{ file: bitmap, width, height }], stack: "beside" },
		{ x: 0, y: 0, width, height },
		inRepository(cut.file),
	);
}

/** The vault this checkout holds, which is served in place, so its diagrams are tracked embeds. */
const CHECKOUT_VAULT: TrackedVault = ".archboard/vault";

/**
 * Whether a diagram is a tracked embed: drawn in place from this checkout's own vault.
 * @param spec The diagram.
 * @returns Whether its board lists its files.
 */
function isTrackedEmbed(spec: DiagramSpec): boolean {
	return spec.vault === CHECKOUT_VAULT;
}

/**
 * Draw one theme of a diagram into docs/readme, its faces cut down. A tracked embed is drawn
 * there with `--track` and keeps its recipe; a copy's picture is drawn in the scratch directory
 * and loses it.
 * @param spec The diagram.
 * @param server The take's server.
 * @param theme The theme.
 * @param work A directory for the faces and the copy's picture.
 * @returns The picture's size, as `semantic render` reported it.
 */
async function drawTheme(
	spec: DiagramSpec,
	server: TakeServer,
	theme: "light" | "dark",
	work: string,
): Promise<z.infer<typeof RenderReceiptSchema>> {
	const file = readmeFile(`${spec.name}-${theme}.svg`);
	const tracked = isTrackedEmbed(spec);
	const drawn = tracked ? inRepository(file) : join(work, `${theme}.svg`);
	const tracking = ["--track", "--doing", `Drawing ${file} for the README as a tracked embed`];
	const receipt = await server.cli([
		"semantic",
		"render",
		...subjectArguments(spec),
		"--no-legend",
		"--theme",
		theme,
		"--out",
		drawn,
		...(tracked ? tracking : []),
	]);
	const svg = readFileSync(drawn, "utf8");
	const kept = tracked ? svg : svg.replace(RECIPE_ELEMENT, "");
	writeFileSync(inRepository(file), await subsetFaces(kept, work));
	return RenderReceiptSchema.parse(receipt);
}

/**
 * What making a diagram does, one sentence a step.
 * @param spec The diagram.
 * @returns The steps.
 */
function diagramPlan(spec: DiagramSpec): readonly string[] {
	const through = spec.view === undefined ? "" : ` through its view "${spec.view}"`;
	const drawing = isTrackedEmbed(spec)
		? [
				`Start an Archboard server over ${spec.vault} in place.`,
				`Draw "${spec.board}"${through} in light and dark into docs/readme with archboard semantic render --track, so the board lists each file as a tracked embed.`,
			]
		: [
				`Start an Archboard server over a copy of ${spec.vault}.`,
				`Draw "${spec.board}"${through} in light and dark with archboard semantic render, and leave its render recipe out.`,
			];
	return [
		...drawing,
		"Cut each embedded face down to the characters the picture draws, with pyftsubset.",
		...(spec.thumbnail === undefined
			? []
			: [
					`Rasterize the top-left 16:9 region of the ${spec.thumbnail.theme} picture with archboard semantic rasterize, and encode it as ${spec.thumbnail.file}.`,
				]),
	];
}

/**
 * The producer of one README diagram.
 * @param spec The diagram.
 * @returns The producer.
 */
function diagramProducer(spec: DiagramSpec): Producer {
	return {
		kind: "svg",
		codex: false,
		files: [
			readmeFile(`${spec.name}-light.svg`),
			readmeFile(`${spec.name}-dark.svg`),
			...(spec.thumbnail === undefined ? [] : [spec.thumbnail.file]),
		],
		attachments: [],
		needs: spec.thumbnail === undefined ? ["pyftsubset"] : ["pyftsubset", "chromium", "ffmpeg"],
		plan: diagramPlan(spec),
		/** Draw both themes, cut their faces down, and cut the thumbnail. */
		make: async () => {
			const work = scratch("diagrams", spec.name);
			const take = `diagram-${spec.name}`;
			const server = isTrackedEmbed(spec)
				? await startCheckoutServer(take)
				: await startServer(take, spec.vault, false);
			await holding(server.stop, async () => {
				const [size] = await inOrder(["light", "dark"] as const, async (theme) =>
					drawTheme(spec, server, theme, work),
				);
				if (size !== undefined) await thumbnail(spec, server, size, work);
			});
		},
	};
}

export { diagramProducer };
