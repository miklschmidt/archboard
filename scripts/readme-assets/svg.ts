// The README's diagrams: SVGs drawn by `archboard semantic render`, in light and dark, each with
// its embedded faces cut down to the characters it draws, so the page stays light. The same board
// gives the same bytes. An index thumbnail of one of them is a region rasterized by `archboard
// semantic rasterize` and encoded as a still WebP.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { encodeThumbnail } from "./encode.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { inRepository, readmeFile, type Producer } from "./producer.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { startServer, type TakeServer, type TrackedVault } from "./server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { pyftsubsetCommand, run, scratch } from "./tools.ts";

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

/**
 * Cut each face an SVG embeds down to the characters it draws.
 * @param input The SVG `semantic render` wrote.
 * @param output Where the smaller SVG goes.
 * @param work A directory for the faces.
 */
async function subsetFaces(input: string, output: string, work: string): Promise<void> {
	const svg = readFileSync(input, "utf8");
	const faces = [...svg.matchAll(/url\("data:font\/ttf;base64,([A-Za-z0-9+/=]+)"\)/g)].map(
		(match) => match[1] ?? "",
	);
	const text = unescapeXml(svg.replaceAll(/@font-face\{[^}]*\}/g, "").replaceAll(/<[^>]+>/g, " "));
	const characters = join(work, "characters.txt");
	const kept = new Set([...codePoints(text), ...KEPT_CHARACTERS]);
	writeFileSync(characters, [...kept].toSorted().join(""));
	let smaller = svg;
	for (const [index, face] of faces.entries()) {
		const whole = join(work, `face-${index}.ttf`);
		const cut = join(work, `face-${index}.subset.ttf`);
		writeFileSync(whole, Buffer.from(face, "base64"));
		// oxlint-disable-next-line no-await-in-loop -- one subsetter at a time keeps the machine quiet
		await run([
			...pyftsubsetCommand(),
			whole,
			`--text-file=${characters}`,
			`--output-file=${cut}`,
			"--layout-features=*",
			"--no-hinting",
			"--desubroutinize",
		]);
		smaller = smaller.replace(face, readFileSync(cut).toString("base64"));
	}
	writeFileSync(output, smaller);
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

/**
 * The producer of one README diagram.
 * @param spec The diagram.
 * @returns The producer.
 */
function diagramProducer(spec: DiagramSpec): Producer {
	const through = spec.view === undefined ? "" : ` through its view "${spec.view}"`;
	return {
		kind: "svg",
		codex: false,
		files: [
			readmeFile(`${spec.name}-light.svg`),
			readmeFile(`${spec.name}-dark.svg`),
			...(spec.thumbnail === undefined ? [] : [spec.thumbnail.file]),
		],
		needs: spec.thumbnail === undefined ? ["pyftsubset"] : ["pyftsubset", "chromium", "ffmpeg"],
		plan: [
			`Start an Archboard server over a copy of ${spec.vault}.`,
			`Draw "${spec.board}"${through} in light and dark with archboard semantic render.`,
			"Cut each embedded face down to the characters the picture draws, with pyftsubset.",
			...(spec.thumbnail === undefined
				? []
				: [
						`Rasterize the top-left 16:9 region of the ${spec.thumbnail.theme} picture with archboard semantic rasterize, and encode it as ${spec.thumbnail.file}.`,
					]),
		],
		/** Draw both themes, cut their faces down, and cut the thumbnail. */
		make: async () => {
			const work = scratch("diagrams", spec.name);
			const server = await startServer(`diagram-${spec.name}`, spec.vault, false);
			try {
				let size: z.infer<typeof RenderReceiptSchema> | undefined;
				for (const theme of ["light", "dark"] as const) {
					const drawn = join(work, `${theme}.svg`);
					// oxlint-disable-next-line no-await-in-loop -- the themes are drawn one after the other
					const receipt = await server.cli([
						"semantic",
						"render",
						...subjectArguments(spec),
						"--theme",
						theme,
						"--out",
						drawn,
					]);
					size = RenderReceiptSchema.parse(receipt);
					// oxlint-disable-next-line no-await-in-loop -- the subsetter runs once per theme
					await subsetFaces(drawn, inRepository(readmeFile(`${spec.name}-${theme}.svg`)), work);
				}
				if (size !== undefined) await thumbnail(spec, server, size, work);
			} finally {
				await server.stop();
			}
		},
	};
}

export { diagramProducer };
