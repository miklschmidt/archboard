// The mark and the wordmark: a gold peak with a second stroke inside it and a
// swoosh over its shoulder, and ARCHBOARD in tracked capitals beside it. They
// replace the lowercase wordmark; the name stays the accessible name.

import type { JSX } from "react";

/** The peak, in the gold gradient of the theme (`--mark-hi` to `--mark-lo`). */
function Mark(): JSX.Element {
	return (
		<svg
			width="34"
			height="32"
			viewBox="0 0 60 56"
			aria-hidden="true"
			className="mb-[3px] shrink-0"
			data-slot="brand-mark"
		>
			<defs>
				<linearGradient id="archboard-mark" x1="0" y1="0" x2="0.3" y2="1">
					<stop offset="0" style={{ stopColor: "var(--mark-hi)" }} />
					<stop offset="1" style={{ stopColor: "var(--mark-lo)" }} />
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
		<h1 className="flex items-end gap-3" data-slot="brand">
			<Mark />
			<span
				aria-hidden="true"
				className="font-wordmark mb-[7px] text-[21px] leading-none font-bold tracking-[0.14em]"
			>
				ARCHBOARD
			</span>
			<span className="sr-only">archboard</span>
		</h1>
	);
}

export { Brand };
