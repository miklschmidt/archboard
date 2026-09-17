// What vite.config.ts serves a page that draws pictures itself (TASK-247).
declare module "virtual:archboard-renderer" {
	import type { ThemeColors } from "@/transformers/semantic-renderer/host";

	/** The diagram theme colours, parsed from the shared stylesheet at build time. */
	export const themeColors: ThemeColors;
	/** A digest of the renderer's sources; a picture kept by another build is not shown. */
	export const rendererBuild: string;
}
