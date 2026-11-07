import { Features, transform, type CssColor, type RGBColor } from "lightningcss";

/**
 * Let Lightning CSS perform gamut conversion, retaining its first sRGB fallback.
 * @param color A parsed literal CSS color.
 * @returns Its portable sRGB representation, including alpha.
 */
function srgbOf(color: CssColor): RGBColor {
	if (typeof color === "object" && color.type === "rgb") return color;
	const lowered = transform({
		filename: "theme-color.css",
		code: Buffer.from(".export { color: transparent }"),
		include: Features.Colors,
		visitor: {
			Declaration: {
				/**
				 * Supply the source color to Lightning CSS's lowering pass.
				 * @returns The typed source declaration.
				 */
				color: () => ({ property: "color", value: color }),
			},
		},
	});
	let srgb: RGBColor | undefined;
	transform({
		filename: "theme-color.css",
		code: lowered.code,
		visitor: {
			/**
			 * Capture the portable fallback emitted before wider-gamut alternatives.
			 * @param candidate A parsed fallback color.
			 */
			Color(candidate) {
				if (srgb === undefined && typeof candidate === "object" && candidate.type === "rgb")
					srgb = candidate;
			},
		},
	});
	if (srgb === undefined)
		throw new Error("Theme colors must be literal colors convertible to sRGB.");
	return srgb;
}

/**
 * Opaque colors use full hex; translucent colors use SVG-compatible rgba.
 * @param color A parsed CSS color.
 * @returns Concrete paint, without CSS variables or modern color-space dependencies.
 */
function exportColor(color: CssColor): string {
	const { r, g, b, alpha } = srgbOf(color);
	// Color-space fallback generation may quantize alpha to eight bits. Retain
	// the authored opacity independently of the converted color channels.
	const opacity = Number(
		(typeof color === "object" && "alpha" in color ? color.alpha : alpha).toFixed(6),
	);
	return opacity === 1
		? `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
		: `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export { exportColor };
