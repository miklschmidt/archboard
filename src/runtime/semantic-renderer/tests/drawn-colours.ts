// Reading the colours a drawing is painted in, for owners that compare them.
//
// A picture paints with CSS expressions of the page's tokens — `var()`,
// `color-mix(in srgb, …)`, `light-dark()` and relative `oklch(from …)` — and
// CSS resolves them where the picture is shown. `paintedIn` resolves them the way CSS does, for one theme,
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
 * One sRGB channel, 0 to 255, as linear light, 0 to 1.
 * @param channel The channel.
 * @returns Its linear value.
 */
function linear(channel: number): number {
	const part = channel / 255;
	return part <= 0.040_45 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
}

/**
 * One linear value as an sRGB channel, clipped to the gamut as a browser paints it.
 * @param value The linear value.
 * @returns The channel, 0 to 255.
 */
function encoded(value: number): number {
	const part = Math.min(1, Math.max(0, value));
	return 255 * (part <= 0.003_130_8 ? 12.92 * part : 1.055 * part ** (1 / 2.4) - 0.055);
}

/**
 * A colour in OKLCH: its lightness, chroma and hue in degrees.
 * @param colour The colour.
 * @returns Its OKLCH coordinates.
 */
function oklchOf(colour: Rgba): { l: number; c: number; h: number } {
	const [r, g, b] = [linear(colour.r), linear(colour.g), linear(colour.b)];
	const [l, m, s] = [
		0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b,
		0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b,
		0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b,
	].map(Math.cbrt) as [number, number, number];
	const lightness = 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
	const a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
	const bb = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
	return { l: lightness, c: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

/**
 * A colour from OKLCH coordinates, clipped to sRGB.
 * @param oklch Its lightness, chroma and hue in radians.
 * @param oklch.l Its lightness.
 * @param oklch.c Its chroma.
 * @param oklch.h Its hue, in radians.
 * @param alpha Its alpha.
 * @returns Its channels.
 */
function fromOklch(
	{ l: lightness, c, h }: { l: number; c: number; h: number },
	alpha: number,
): Rgba {
	const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
	const l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
	const m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
	const s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
	return {
		r: encoded(4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s),
		g: encoded(-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s),
		b: encoded(-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_695_66 * s),
		a: alpha,
	};
}

/**
 * A relative OKLCH colour as the renderer writes one: an origin colour at a
 * lightness of its own, keeping a share of the origin's chroma up to a cap,
 * and the origin's hue.
 */
const RELATIVE_OKLCH =
	/^from\s+([\s\S]+)\s+([\d.]+)\s+calc\(min\(c,\s*([\d.]+)\)\s*\*\s*([\d.]+)\)\s+h$/u;

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
	const relative = name === "oklch" ? RELATIVE_OKLCH.exec(inner!) : null;
	if (relative !== null) {
		const [, origin, lightness, cap, share] = relative;
		const colour = resolve(origin!, theme);
		const { c, h } = oklchOf(colour);
		return fromOklch(
			{ l: Number(lightness), c: Math.min(c, Number(cap)) * Number(share), h },
			colour.a,
		);
	}
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

/** What a crossing's mask paints with: luminance, kept or cut, never a theme's ink. */
const MASK_PAINT = new Set(["white", "black"]);

/**
 * One painted value as a reader sees it in one theme: a colour resolved to a
 * literal, anything else (`none`, `url(#…)`, a mask's white or black) as it is.
 * @param value The paint.
 * @param theme The theme it is shown in.
 * @returns The literal.
 */
function colourIn(value: string, theme: DiagramTheme): string {
	return value === "none" || value.startsWith("url(") || MASK_PAINT.has(value)
		? value
		: literalOf(resolve(value, theme));
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
 * How light a hex colour is, as the contrast formula of WCAG measures it.
 * @param hex The colour.
 * @returns Its relative luminance.
 */
function luminance(hex: string): number {
	const [r, g, b] = rgbOf(hex).map((channel) => {
		const part = channel / 255;
		return part <= 0.039_28 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The contrast between two hex colours, as WCAG measures it.
 * @param one A colour.
 * @param other Another.
 * @returns The ratio, at least 1.
 */
function contrast(one: string, other: string): number {
	const [lighter, darker] = [luminance(one), luminance(other)].toSorted((a, b) => b - a);
	return (lighter! + 0.05) / (darker! + 0.05);
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

export { colourDistance, colourIn, contrast, hueOf, luminance, paintedIn, seenIn };
