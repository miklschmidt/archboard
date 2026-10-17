// What a place that runs the renderer installs before its first picture: the
// layout engine, the theme colours and the embedded font bytes, which font
// files it has to load into its canvas under which names (`lib/host.ts`), and
// which icons it draws whatever a vault's policy names.
export {
	installRendererHost,
	rendererHost,
	SOLVE_STAGE,
	type RendererHost,
	type ThemeColors,
} from "@/transformers/semantic-renderer/lib/host";
export { FACES, FONT_URL_PREFIX } from "@/transformers/semantic-renderer/lib/fonts";
export { OWN_ICONS } from "@/transformers/semantic-renderer/lib/svg/icons";
