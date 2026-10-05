// The lockup the README's art sets: the mark beside the name. The mark is a gold peak with a
// second stroke inside it and a swoosh over its shoulder, in the theme's gradient from --mark-hi
// to --mark-lo. The name is archboard in the display face's tracked capitals. The shell draws the
// same lockup (src/ui/shell/components/Brand.tsx), and the repository lane holds this geometry to
// the shell's, so the two cannot drift.

/** The mark's geometry, as the shell draws it. */
const MARK = {
	viewBox: "0 0 60 56",
	/** The direction of the gold gradient, in the mark's bounding box. */
	gradient: { x1: "0", y1: "0", x2: "0.3", y2: "1" },
	/** The peak and the stroke inside it, filled. */
	fills: ["M28,3 L56,53 L47,53 L28,19 L9,53 L0,53 Z", "M20,53 L28,38 L32,44.5 L26,53 Z"],
	/** The swoosh over the peak's shoulder, stroked with round ends. */
	swoosh: { d: "M37,7 Q54,19 49,37", width: "3.4" },
} as const;

/**
 * A length of the shell's lockup, whose name is 18px, as a share of the name's size.
 * @param shellPixels The length in the shell, in pixels.
 * @returns The length in em.
 */
function em(shellPixels: number): string {
	return `${(shellPixels / 18).toFixed(4)}em`;
}

/**
 * The lockup as markup for a page that has loaded src/shared/theme/theme.css and names the display
 * face "Archboard Display". Its proportions are the shell's: at a name of 18px the mark is 22 by
 * 21, 10 away, and the name's line is 21 high.
 * @param size The name's font size, in pixels; the mark scales with it.
 * @returns The markup.
 */
function lockupMarkup(size: number): string {
	const { gradient, fills, swoosh, viewBox } = MARK;
	const mark = `<svg viewBox="${viewBox}" style="width:${em(22)};height:${em(21)};flex-shrink:0" aria-hidden="true">
		<defs><linearGradient id="archboard-mark" x1="${gradient.x1}" y1="${gradient.y1}" x2="${gradient.x2}" y2="${gradient.y2}">
			<stop offset="0" stop-color="var(--mark-hi)"/><stop offset="1" stop-color="var(--mark-lo)"/>
		</linearGradient></defs>
		<g fill="url(#archboard-mark)">${fills.map((d) => `<path d="${d}"/>`).join("")}</g>
		<path d="${swoosh.d}" fill="none" stroke="url(#archboard-mark)" stroke-width="${swoosh.width}" stroke-linecap="round"/>
	</svg>`;
	const name = `<span style="font-family:'Archboard Display';font-weight:500;text-transform:uppercase;letter-spacing:0.07em;line-height:${em(21)};margin-bottom:${em(-1)};color:var(--foreground)">archboard</span>`;
	return `<div style="display:flex;align-items:flex-end;gap:${em(10)};font-size:${size}px">${mark}${name}</div>`;
}

export { MARK, lockupMarkup };
