// The renderer core's measure of a board's words, under the Bun host.
import type { VariantContent } from "@archboard/board/content";
import { measureArchitecture as measureArchitectureIn } from "#shared/rules/render/measure.ts";
import { type MeasuredArchitecture } from "#shared/rules/render/drawing.ts";
import { installBunHost } from "#runtime/services/bun-host.ts";

/**
 * Measure every architectural subject before placement or SVG emission.
 * @param content The already validated semantic content.
 * @returns Text, card minima, container headers and relationship labels.
 */
function measureArchitecture(content: VariantContent): MeasuredArchitecture {
	installBunHost();
	return measureArchitectureIn(content);
}

export { measureArchitecture };
