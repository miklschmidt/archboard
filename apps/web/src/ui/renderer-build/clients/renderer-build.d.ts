// What vite.config.ts serves a page that draws pictures itself (TASK-247).
declare module "virtual:archboard-renderer" {
	/** A digest of the renderer's sources; a picture kept by another build is not shown. */
	export const rendererBuild: string;
}
