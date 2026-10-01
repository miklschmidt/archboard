// The mark and the wordmark: a gold peak with a second stroke inside it and a
// swoosh over its shoulder, and archboard beside it in the display face, the
// tall condensed face every board's name is set in. The wordmark keeps the
// name's lowercase, as the CLI writes it, which is also what sets it apart
// from a board's name, always in capitals.

import type { JSX } from "react";

/** The gradient's two stops, from the theme. */
const MARK_HI = { stopColor: "var(--mark-hi)" } as const;
const MARK_LO = { stopColor: "var(--mark-lo)" } as const;

/**
 * The peak, in the gold gradient of the theme (`--mark-hi` to `--mark-lo`).
 * @returns The mark.
 */
function Mark(): JSX.Element {
	return (
		<svg
			width="22"
			height="21"
			viewBox="0 0 60 56"
			aria-hidden="true"
			className="shrink-0"
			data-slot="brand-mark"
		>
			<defs>
				<linearGradient id="archboard-mark" x1="0" y1="0" x2="0.3" y2="1">
					<stop offset="0" style={MARK_HI} />
					<stop offset="1" style={MARK_LO} />
				</linearGradient>
			</defs>
			<g fill="url(#archboard-mark)">
				<path d="M28,3 L56,53 L47,53 L28,19 L9,53 L0,53 Z" />
				<path d="M20,53 L28,38 L32,44.5 L26,53 Z" />
			</g>
			<path
				d="M37,7 Q54,19 49,37"
				fill="none"
				stroke="url(#archboard-mark)"
				strokeWidth="3.4"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * The brand: the mark and the wordmark.
 * @returns The heading of the page.
 */
function Brand(): JSX.Element {
	return (
		<h1 className="flex items-end gap-2.5" data-slot="brand">
			<Mark />
			<span
				aria-hidden="true"
				className="font-display -mb-[3px] text-[25px] leading-[22px] font-bold tracking-[0.03em]"
			>
				archboard
			</span>
			<span className="sr-only">archboard</span>
		</h1>
	);
}

export { Brand };
