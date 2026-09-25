// Reading the colours a drawing is painted in, for owners that compare them.
//
// A picture paints with CSS expressions of the page's tokens — `var()`,
// `color-mix(in srgb, …)` and `light-dark()` — and CSS resolves them where the
// picture is shown. `paintedIn` resolves them the way CSS does, for one theme,
// and writes each paint back as the literal attribute it stands for, so an
// owner can compare colours as a reader sees them.

import type { DiagramTheme } from "@/shared/semantic-board/index";
import { themeColor } from "@/shared/theme/server";

/** One colour: sRGB channels 0 to 255 and alpha 0 to 1. */
interface Rgba {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/**
 * The arguments of a function call, split at its top-level commas.
 * @param inner What is between the call's parentheses.
 * @returns The arguments, trimmed.
 */
function argumentsOf(inner: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (const [index, character] of [...inner].entries()) {
		if (character === "(") depth += 1;
		if (character === ")") depth -= 1;
		if (character === "," && depth === 0) {
			parts.push(inner.slice(start, index).trim());
			start = index + 1;
		}
	}
	parts.push(inner.slice(start).trim());
	return parts;
}

/**
 * A literal colour as the shared theme exports one: `#rrggbb` or `rgba(…)`.
 * @param literal The colour.
 * @returns Its channels.
 * @throws {Error} For any other spelling.
 */
function literalColour(literal: string): Rgba {
	const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/iu.exec(literal);
	if (hex !== null) {
		const [r, g, b] = [hex[1]!, hex[2]!, hex[3]!].map((part) => Number.parseInt(part, 16));
		return { r: r!, g: g!, b: b!, a: hex[4] === undefined ? 1 : Number.parseInt(hex[4], 16) / 255 };
	}
	const rgba = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/u.exec(literal);
	if (rgba !== null) {
		return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
	}
	throw new Error(`Not a literal colour: ${literal}`);
}

/**
 * Two colours mixed in sRGB as `color-mix()` mixes them: premultiplied by
 * their alpha, so mixing with `transparent` keeps the colour and lowers its
 * alpha.
 * @param one The first colour.
 * @param share The first colour's share, 0 to 1.
 * @param other The second colour.
 * @returns The mix.
 */
function mix(one: Rgba, share: number, other: Rgba): Rgba {
	const a = one.a * share + other.a * (1 - share);
	if (a === 0) return TRANSPARENT;
	const channel = (key: "r" | "g" | "b") =>
		(one[key] * one.a * share + other[key] * other.a * (1 - share)) / a;
	return { r: channel("r"), g: channel("g"), b: channel("b"), a };
}

/**
 * One colour expression, resolved for one theme.
 * @param expression A colour the renderer painted with.
 * @param theme The theme it is shown in.
 * @returns Its channels.
 * @throws {Error} For an expression the renderer does not write.
 */
function resolve(expression: string, theme: DiagramTheme): Rgba {
	const text = expression.trim();
	if (text === "transparent") return TRANSPARENT;
	const call = /^([a-z-]+)\(([\s\S]*)\)$/u.exec(text);
	if (call === null) return literalColour(text);
	const [, name, inner] = call;
	const parts = argumentsOf(inner!);
	if (name === "var") return literalColour(themeColor(theme, parts[0]!));
	if (name === "light-dark") return resolve(parts[theme === "light" ? 0 : 1]!, theme);
	if (name === "color-mix" && parts[0] === "in srgb") {
		const first = /^([\s\S]+?)\s+([\d.]+)%$/u.exec(parts[1]!);
		if (first === null) throw new Error(`A mix without a share: ${text}`);
		return mix(resolve(first[1]!, theme), Number(first[2]) / 100, resolve(parts[2]!, theme));
	}
	if (name === "rgba") return literalColour(text);
	throw new Error(`Not a colour the renderer paints with: ${text}`);
}

/**
 * A resolved colour as a literal: `#rrggbb` when opaque, `#rrggbbaa` when not.
 * @param colour The channels.
 * @returns The literal.
 */
function literalOf(colour: Rgba): string {
	const digits = [colour.r, colour.g, colour.b].map((value) =>
		Math.round(value).toString(16).padStart(2, "0"),
	);
	const alpha =
		colour.a === 1
			? ""
			: Math.round(colour.a * 255)
					.toString(16)
					.padStart(2, "0");
	return `#${digits.join("")}${alpha}`;
}

/**
 * One painted value as a reader sees it in one theme: a colour resolved to a
 * literal, anything else (`none`, `url(#…)`) as it is.
 * @param value The paint.
 * @param theme The theme it is shown in.
 * @returns The literal.
 */
function colourIn(value: string, theme: DiagramTheme): string {
	return value === "none" || value.startsWith("url(") ? value : literalOf(resolve(value, theme));
}

/**
 * A drawn document with every paint resolved for one theme and written back as
 * the literal attribute it stands for, where the renderer's `style` stands.
 * @param svg The drawn document.
 * @param theme The theme it is shown in.
 * @returns The document, painted in literals.
 */
function paintedIn(svg: string, theme: DiagramTheme = "light"): string {
	return svg.replace(/ style="([^"]*)"/gu, (whole, declarations: string) => {
		const paint = declarations.split(";").map((one) => {
			const at = one.indexOf(":");
			return [one.slice(0, at), one.slice(at + 1)] as const;
		});
		if (!paint.every(([name]) => ["fill", "stroke", "stop-color"].includes(name))) return whole;
		return paint.map(([name, value]) => ` ${name}="${colourIn(value, theme)}"`).join("");
	});
}

/**
 * The three channels of a hex colour.
 * @param hex The colour.
 * @returns Red, green and blue, 0 to 255.
 */
function rgbOf(hex: string): [number, number, number] {
	return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
		number,
		number,
		number,
	];
}

/**
 * The hue of a hex colour, in degrees.
 * @param hex The colour.
 * @returns Its hue.
 */
function hueOf(hex: string): number {
	const [r, g, b] = rgbOf(hex).map((value) => value / 255) as [number, number, number];
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	if (delta === 0) return 0;
	const sector =
		max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
	return (sector * 60 + 360) % 360;
}

/**
 * How far apart two hex colours are, channel by channel.
 * @param a One colour.
 * @param b The other.
 * @returns The distance.
 */
function colourDistance(a: string, b: string): number {
	const [x, y] = [rgbOf(a), rgbOf(b)];
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * A drawing as a reader sees it in one theme: every paint resolved to a literal.
 * @param drawn The drawing.
 * @param theme The theme it is shown in.
 * @returns The same drawing, painted in literals.
 */
function seenIn<Drawn extends { readonly svg: string }>(
	drawn: Drawn,
	theme: DiagramTheme = "light",
): Drawn {
	return { ...drawn, svg: paintedIn(drawn.svg, theme) };
}

export { colourDistance, colourIn, hueOf, paintedIn, seenIn };
