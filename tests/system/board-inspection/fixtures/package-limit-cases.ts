import type { PackageElement } from "./package-cases.js";

export const inputLimitedScene = (): PackageElement[] => [
	{
		id: "x".repeat(999_985),
		type: "rectangle",
		x: 0,
		y: 0,
		width: 1,
		height: 1,
	},
];
