// The colours the orb draws with, read from the theme. A canvas cannot use a
// custom property, so the tokens are resolved to numbers when the page is drawn
// and again when the theme changes. The orb never carries a colour of its own.

/** A colour as the canvas wants it: red, green and blue, 0..255. */
interface Rgb {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

/** What the painter draws with. */
interface OrbColors {
	/** The bright end of the gold: the lines at the front and the ring's highlight. */
	readonly hi: Rgb;
	/** The dark end of the gold: the lines at the back and the ring's shadow. */
	readonly lo: Rgb;
	/** The gold as a flat fill: the ring's body. */
	readonly gold: Rgb;
	/** The plate the lines are drawn on. */
	readonly plate: Rgb;
	/** Whether the plate is dark, which decides how light adds to it. */
	readonly dark: boolean;
}

/** The theme tokens each colour comes from. */
const TOKENS = {
	hi: "--mark-hi",
	lo: "--mark-lo",
	gold: "--primary",
	plate: "--card",
} as const;

/** What a colour reads as when the theme has no such token: the gold, and a dark plate. */
const FALLBACK: OrbColors = {
	hi: { r: 240, g: 190, b: 60 },
	lo: { r: 160, g: 110, b: 20 },
	gold: { r: 235, g: 185, b: 55 },
	plate: { r: 40, g: 38, b: 34 },
	dark: true,
};

/** The share of the way to white at which a plate is no longer dark. */
const LIGHT_PLATE = 140;

/**
 * Write a colour for the canvas to draw with.
 * @param color The colour.
 * @param alpha How opaque, 0..1.
 * @returns The colour as a canvas fill.
 */
function rgba(color: Rgb, alpha: number): string {
	return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.min(1, Math.max(0, alpha))})`;
}

/**
 * Turn any CSS colour into numbers, by painting one pixel of it. The browser
 * does the parsing, so the theme can write its colours in OKLCH.
 * @param probe A one-pixel canvas to paint on.
 * @param css The colour as the theme writes it.
 * @param fallback What to use when the browser cannot read it.
 * @returns The colour in sRGB.
 */
function resolveColor(probe: CanvasRenderingContext2D, css: string, fallback: Rgb): Rgb {
	if (css === "") return fallback;
	probe.clearRect(0, 0, 1, 1);
	probe.fillStyle = css;
	probe.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
	if (r === undefined || g === undefined || b === undefined || a === 0) return fallback;
	return { r, g, b };
}

/**
 * Read one theme token as a colour.
 * @param probe A one-pixel canvas to paint on.
 * @param style The computed style the tokens are read from.
 * @param token The custom property.
 * @param fallback What to use when the theme has no such token.
 * @returns The colour.
 */
function readToken(
	probe: CanvasRenderingContext2D,
	style: CSSStyleDeclaration,
	token: string,
	fallback: Rgb,
): Rgb {
	return resolveColor(probe, style.getPropertyValue(token).trim(), fallback);
}

/**
 * Read the orb's colours from the theme as it stands on an element.
 * @param element Where the theme's tokens apply.
 * @returns The colours.
 */
function readOrbColors(element: Element): OrbColors {
	const probe = document.createElement("canvas");
	probe.width = 1;
	probe.height = 1;
	const context = probe.getContext("2d", { willReadFrequently: true });
	if (context === null) return FALLBACK;
	const style = getComputedStyle(element);
	const plate = readToken(context, style, TOKENS.plate, FALLBACK.plate);
	return {
		hi: readToken(context, style, TOKENS.hi, FALLBACK.hi),
		lo: readToken(context, style, TOKENS.lo, FALLBACK.lo),
		gold: readToken(context, style, TOKENS.gold, FALLBACK.gold),
		plate,
		dark: plate.r + plate.g + plate.b < LIGHT_PLATE * 3,
	};
}

export { readOrbColors, rgba, type OrbColors, type Rgb };
