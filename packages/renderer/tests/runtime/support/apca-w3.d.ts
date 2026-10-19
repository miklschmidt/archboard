// apca-w3 0.1.9 ships JavaScript and no type declarations, so the vendor
// cannot be the source of its type. This is the one local declaration of the
// part of its interface the picture's contrast checks use (`src/apca-w3.js`).
// Recheck it on every upgrade: palette-contrast.test.ts holds black on white
// at Lc 106, white on black at Lc -108, and the sign of each polarity.
declare module "apca-w3" {
	/**
	 * The lightness contrast Lc of text on a background, signed: positive for
	 * dark text on a light background, negative for light text on a dark one.
	 * @param textY The text's screen luminance, from `sRGBtoY`.
	 * @param backgroundY The background's.
	 * @returns Lc, about -108 to 106.
	 */
	export function APCAcontrast(textY: number, backgroundY: number): number;
	/**
	 * The screen luminance APCA reads of an sRGB colour.
	 * @param rgb Its red, green and blue, 0 to 255.
	 * @returns Its luminance, 0 to 1.
	 */
	export function sRGBtoY(rgb: readonly [number, number, number]): number;
}
