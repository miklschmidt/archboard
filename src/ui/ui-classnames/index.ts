import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Match the semantic scales in theme/app.css, so a caller replaces a primitive's
// default utility instead of leaving both classes for stylesheet order to decide.
const mergeClasses = extendTailwindMerge({
	extend: {
		theme: {
			spacing: [
				"rule",
				"compact",
				"grid-tight",
				"control",
				"control-inline",
				"region",
				"panel",
				"touch-target",
				"header",
				"status-dot",
			],
			text: ["kicker", "technical", "body", "control", "title"],
			radius: ["hairline", "compact", "control", "panel", "dialog", "round"],
			font: ["sans", "mono"],
			"font-weight": ["regular"],
			tracking: ["wordmark"],
			shadow: ["flat"],
			ease: ["control", "status"],
			animate: ["status"],
		},
	},
});

export function cn(...inputs: ClassValue[]): string {
	return mergeClasses(clsx(inputs));
}
