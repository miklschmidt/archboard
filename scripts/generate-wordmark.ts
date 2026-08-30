import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "src/ui/shell/assets/fonts/Onest-Medium-v1.000.ttf");
const defaultOutputPath = path.join(repoRoot, "src/ui/shell/assets/archboard-wordmark.svg");

export const WORDMARK_SOURCE_SHA256 =
	"c3014cae121488aea22ae5b50b584db332f130189be95217edf57469ef297cec";
export const WORDMARK_TEXT = "archboard";
export const WORDMARK_FONT_SIZE_PX = 18.5;
export const WORDMARK_TRACKING_EM = -0.02027027027;

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

interface OpenTypeFont {
	names: {
		fontFamily: { en?: string };
		fontSubfamily: { en?: string };
		preferredFamily?: { en?: string };
		preferredSubfamily?: { en?: string };
		postScriptName: { en?: string };
		version: { en?: string };
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

const require = createRequire(import.meta.url);
const opentype = require("opentype.js") as OpenTypeModule;

function sha256(filename: string): string {
	return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function decimal(value: number): string {
	return Number(value.toFixed(4)).toString();
}

function translate(command: PathCommand, dx: number, dy: number): void {
	for (const key of ["x", "x1", "x2"] as const) {
		if (command[key] !== undefined) command[key] += dx;
	}
	for (const key of ["y", "y1", "y2"] as const) {
		if (command[key] !== undefined) command[key] += dy;
	}
}

export function renderWordmarkSvg(): string {
	const actualHash = sha256(sourcePath);
	if (actualHash !== WORDMARK_SOURCE_SHA256) {
		throw new Error(
			`Onest Medium source hash mismatch: expected ${WORDMARK_SOURCE_SHA256}, received ${actualHash}`,
		);
	}

	const font = opentype.loadSync(sourcePath);
	if (
		font.names.preferredFamily?.en !== "Onest" ||
		font.names.preferredSubfamily?.en !== "Medium" ||
		font.names.postScriptName.en !== "Onest-Medium" ||
		!font.names.version.en?.includes("1.000")
	) {
		throw new Error(
			`Unexpected wordmark source metadata: ${font.names.preferredFamily?.en ?? font.names.fontFamily.en ?? "?"} / ${font.names.preferredSubfamily?.en ?? font.names.fontSubfamily.en ?? "?"} / ${font.names.version.en ?? "?"}`,
		);
	}

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
			if (!filename) throw new Error("--out requires a filename");
			outputPath = path.resolve(filename);
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return { check, outputPath };
}

export function runGenerator(args = process.argv.slice(2)): void {
	const options = parseOptions(args);
	const expected = renderWordmarkSvg();
	if (options.check) {
		if (!fs.existsSync(options.outputPath)) {
			throw new Error(`Generated wordmark is missing: ${options.outputPath}`);
		}
		if (fs.readFileSync(options.outputPath, "utf8") !== expected) {
			throw new Error(
				`Generated wordmark is stale: run \`bun run generate:wordmark\` (${options.outputPath})`,
			);
		}
		return;
	}
	fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
	fs.writeFileSync(options.outputPath, expected);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runGenerator();
}
