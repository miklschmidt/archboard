import React from "react";

export type IconName =
	| "activity"
	| "boards"
	| "check"
	| "chevron"
	| "close"
	| "folder"
	| "fullscreen"
	| "moon"
	| "plus"
	| "refresh"
	| "settings"
	| "split"
	| "sun"
	| "trash";

interface IconProps {
	name: IconName;
	size?: number;
	className?: string;
}

export function Icon({ name, size = 18, className }: IconProps): React.JSX.Element {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true,
	};

	const paths: Record<IconName, React.ReactNode> = {
		activity: (
			<>
				<path d="M4 16.5 8.5 12l3 3L20 6.5" />
				<path d="M15 6.5h5v5" />
			</>
		),
		boards: (
			<>
				<rect x="3" y="4" width="8" height="7" rx="2" />
				<rect x="13" y="4" width="8" height="7" rx="2" />
				<rect x="3" y="13" width="18" height="7" rx="2" />
			</>
		),
		check: <path d="m5 12 4 4L19 6" />,
		chevron: <path d="m9 18 6-6-6-6" />,
		close: (
			<>
				<path d="m7 7 10 10" />
				<path d="M17 7 7 17" />
			</>
		),
		folder: <path d="M3.5 7.5h6l2-2h3l2 2h4v11h-17z" />,
		fullscreen: (
			<>
				<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />
			</>
		),
		moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
		plus: (
			<>
				<path d="M12 5v14" />
				<path d="M5 12h14" />
			</>
		),
		refresh: (
			<>
				<path d="M20 7v5h-5" />
				<path d="M4 17v-5h5" />
				<path d="M6.1 8.2A7 7 0 0 1 18.5 7L20 9" />
				<path d="M17.9 15.8A7 7 0 0 1 5.5 17L4 15" />
			</>
		),
		settings: (
			<>
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
			</>
		),
		split: (
			<>
				<rect x="3" y="4" width="8" height="16" rx="2" />
				<rect x="13" y="4" width="8" height="16" rx="2" />
			</>
		),
		sun: (
			<>
				<circle cx="12" cy="12" r="3.5" />
				<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
			</>
		),
		trash: (
			<>
				<path d="M4 7h16" />
				<path d="M9 3h6l1 4H8z" />
				<path d="m7 7 1 14h8l1-14" />
				<path d="M10 11v6M14 11v6" />
			</>
		),
	};

	return (
		<svg {...common} className={className}>
			{paths[name]}
		</svg>
	);
}
