// The renderer's text measurement, under the Bun host.
import type { VariantContent } from "@/shared/semantic-board/index";
import {
	measureArchitecture as measureArchitectureIn,
	type MeasuredArchitecture,
} from "@/transformers/semantic-renderer/measurement";
import { installBunHost } from "@/runtime/semantic-renderer/lib/bun-host";

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
export type {
	MeasuredArchitecture,
	MeasuredNode,
	MeasuredLabel,
	TextRun,
} from "@/transformers/semantic-renderer/measurement";
