import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "src/ui/shell/assets/fonts/Onest-Medium-v1.000.ttf");
const defaultOutputPath = path.join(repoRoot, "src/ui/shell/assets/archboard-wordmark.svg");

const WORDMARK_SOURCE_SHA256 = "c3014cae121488aea22ae5b50b584db332f130189be95217edf57469ef297cec";
const WORDMARK_TEXT = "archboard";
const WORDMARK_FONT_SIZE_PX = 18.5;
const WORDMARK_TRACKING_EM = -0.02027027027;

interface PathCommand {
	type: string;
	x?: number;
	y?: number;
	x1?: number;
	y1?: number;
	x2?: number;
	y2?: number;
}

interface OpenTypePath {
	commands: PathCommand[];
	getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
	toPathData(decimalPlaces?: number): string;
}

interface LocalizedName {
	en?: string;
}

interface OpenTypeFont {
	names: {
		fontFamily: LocalizedName;
		fontSubfamily: LocalizedName;
		preferredFamily?: LocalizedName;
		preferredSubfamily?: LocalizedName;
		postScriptName: LocalizedName;
		version: LocalizedName;
	};
	getPath(
		text: string,
		x: number,
		y: number,
		fontSize: number,
		options: { kerning: boolean; letterSpacing: number },
	): OpenTypePath;
}

interface OpenTypeModule {
	loadSync(filename: string): OpenTypeFont;
}

/**
 * Whether a loaded module exposes opentype.js's synchronous font loader; the
 * package ships no type declarations, so this is the boundary that types it.
 * @param value The module namespace.
 * @returns Whether `loadSync` is callable on it.
 */
function isOpenTypeModule(value: unknown): value is OpenTypeModule {
	return (
		typeof value === "object" &&
		value !== null &&
		"loadSync" in value &&
		typeof value.loadSync === "function"
	);
}

/**
 * Load opentype.js through CommonJS, the entry its package resolves for Bun.
 * @returns The typed module.
 * @throws {Error} When the module has no `loadSync`.
 */
function loadOpenType(): OpenTypeModule {
	const loaded: unknown = createRequire(import.meta.url)("opentype.js");
	if (!isOpenTypeModule(loaded)) {
		throw new Error("opentype.js did not expose loadSync");
	}
	return loaded;
}

const opentype = loadOpenType();

/**
 * The SHA-256 of a file as lowercase hex.
 * @param filename The file to hash.
 * @returns The digest.
 */
function sha256(filename: string): string {
	return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

/**
 * Format a coordinate with at most four decimals and no trailing zeros.
 * @param value The number to format.
 * @returns The compact decimal string.
 */
function decimal(value: number): string {
	return Number(value.toFixed(4)).toString();
}

/**
 * Shift a path command's control points in place.
 * @param command The command to move.
 * @param dx The horizontal shift.
 * @param dy The vertical shift.
 */
function translate(command: PathCommand, dx: number, dy: number): void {
	for (const key of ["x", "x1", "x2"] as const) {
		if (command[key] !== undefined) {
			command[key] += dx;
		}
	}
	for (const key of ["y", "y1", "y2"] as const) {
		if (command[key] !== undefined) {
			command[key] += dy;
		}
	}
}

/**
 * Refuse to render from anything but the pinned Onest Medium file.
 * @throws {Error} When the font file's hash differs from the recorded one.
 */
function requirePinnedSource(): void {
	const actualHash = sha256(sourcePath);
	if (actualHash !== WORDMARK_SOURCE_SHA256) {
		throw new Error(
			`Onest Medium source hash mismatch: expected ${WORDMARK_SOURCE_SHA256}, received ${actualHash}`,
		);
	}
}

/**
 * Describe a font's family, subfamily and version for an error message.
 * @param font The loaded font.
 * @returns The description, with `?` for missing names.
 */
function describeFont(font: OpenTypeFont): string {
	const { names } = font;
	const family = firstName(names.preferredFamily, names.fontFamily);
	const subfamily = firstName(names.preferredSubfamily, names.fontSubfamily);
	return `${family} / ${subfamily} / ${names.version.en ?? "?"}`;
}

/**
 * The first English name present among the candidates, or `?`.
 * @param preferred The preferred name table, when the font has one.
 * @param fallback The plain name table.
 * @returns The name to show.
 */
function firstName(preferred: LocalizedName | undefined, fallback: LocalizedName): string {
	return preferred?.en ?? fallback.en ?? "?";
}

/**
 * Whether the loaded font's own metadata names Onest Medium 1.000.
 * @param font The loaded font.
 * @returns Whether every expected name matches.
 */
function isOnestMedium(font: OpenTypeFont): boolean {
	const { names } = font;
	return (
		isPreferredOnestMedium(names) &&
		names.postScriptName.en === "Onest-Medium" &&
		names.version.en?.includes("1.000") === true
	);
}

/**
 * Whether the preferred family and subfamily name Onest Medium.
 * @param names The font's name tables.
 * @returns Whether both preferred names match.
 */
function isPreferredOnestMedium(names: OpenTypeFont["names"]): boolean {
	return names.preferredFamily?.en === "Onest" && names.preferredSubfamily?.en === "Medium";
}

/**
 * Load the pinned font after checking both its bytes and its metadata.
 * @returns The loaded font.
 * @throws {Error} When the metadata is not Onest Medium 1.000.
 */
function loadWordmarkFont(): OpenTypeFont {
	requirePinnedSource();
	const font = opentype.loadSync(sourcePath);
	if (!isOnestMedium(font)) {
		throw new Error(`Unexpected wordmark source metadata: ${describeFont(font)}`);
	}
	return font;
}

/**
 * Render the wordmark as an SVG with its outline moved to the origin, so the
 * asset is reproducible from the pinned font alone.
 * @returns The SVG document text.
 */
function renderWordmarkSvg(): string {
	const font = loadWordmarkFont();
	const outline = font.getPath(WORDMARK_TEXT, 0, 0, WORDMARK_FONT_SIZE_PX, {
		kerning: true,
		letterSpacing: WORDMARK_TRACKING_EM,
	});
	const initialBounds = outline.getBoundingBox();
	for (const command of outline.commands) {
		translate(command, -initialBounds.x1, -initialBounds.y1);
	}
	const bounds = outline.getBoundingBox();
	const width = decimal(bounds.x2 - bounds.x1);
	const height = decimal(bounds.y2 - bounds.y1);
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + " " + height + '">',
		`  <metadata>archboard wordmark; Onest Medium 1.000; ${WORDMARK_FONT_SIZE_PX}px; tracking ${WORDMARK_TRACKING_EM}em; source sha256 ${WORDMARK_SOURCE_SHA256}; SIL OFL 1.1</metadata>`,
		`  <path fill="currentColor" d="${outline.toPathData(4)}"/>`,
		"</svg>",
		"",
	].join("\n");
}

interface CliOptions {
	check: boolean;
	outputPath: string;
}

/**
 * Parse `--check` and `--out <file>` from the command line.
 * @param args The arguments after the script name.
 * @returns The options with the default output path applied.
 * @throws {Error} On an unknown argument or a missing `--out` filename.
 */
function parseOptions(args: string[]): CliOptions {
	let check = false;
	let outputPath = defaultOutputPath;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--check") {
			check = true;
			continue;
		}
		if (argument === "--out") {
			const filename = args[index + 1];
			if (!filename) {
				throw new Error("--out requires a filename");
			}
			outputPath = path.resolve(filename);
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return { check, outputPath };
}

/**
 * Refuse a missing or stale generated wordmark.
 * @param outputPath The generated asset's path.
 * @param expected The freshly rendered SVG.
 * @throws {Error} When the file is absent or differs from the rendering.
 */
function checkGenerated(outputPath: string, expected: string): void {
	if (!fs.existsSync(outputPath)) {
		throw new Error(`Generated wordmark is missing: ${outputPath}`);
	}
	if (fs.readFileSync(outputPath, "utf8") !== expected) {
		throw new Error(
			`Generated wordmark is stale: run \`bun run generate:wordmark\` (${outputPath})`,
		);
	}
}

/**
 * Render the wordmark and either verify the tracked asset or write it.
 * @param args The command-line arguments; defaults to the process's.
 */
function runGenerator(args = process.argv.slice(2)): void {
	const options = parseOptions(args);
	const expected = renderWordmarkSvg();
	if (options.check) {
		checkGenerated(options.outputPath, expected);
		return;
	}
	fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
	fs.writeFileSync(options.outputPath, expected);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runGenerator();
}

export {
	WORDMARK_SOURCE_SHA256,
	WORDMARK_TEXT,
	WORDMARK_FONT_SIZE_PX,
	WORDMARK_TRACKING_EM,
	renderWordmarkSvg,
	runGenerator,
};
