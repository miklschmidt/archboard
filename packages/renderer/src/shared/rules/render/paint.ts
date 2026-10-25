// The hand-off to the renderer core (ADR 0057): a render's drawing, laid out
// here, goes to the core as one paint request, and the core answers the
// picture as one SVG document with its atlas. The core shapes every word and
// draws its glyphs, so the document needs no font.

import type { PaletteColor, SemanticPolicy } from "@archboard/board/policy";
import { FAR_VIEW_SWAP_MS } from "@archboard/timing";
import type {
	DocumentRequest,
	NodeAppearance,
	PageRequest,
	PaintRequest,
	PaintedDocument,
} from "#shared/protocol/generated/core/types.ts";
import type { DiagramRenderRequest } from "#shared/protocol/render-request.ts";
import { rendererHost } from "#shared/rules/render/host.ts";
import { OWN_ICONS } from "#shared/rules/render/icons.ts";

/**
 * What a picture's document says about itself, and what it needs from this host.
 * @param request What the render asks for.
 * @param name What the picture is of.
 * @param description A longer description, when there is one.
 * @returns The document's part of a paint request.
 */
function documentRequest(
	request: DiagramRenderRequest,
	name: string,
	description: string | undefined,
): DocumentRequest {
	return {
		name,
		description,
		farViewSwapMs: FAR_VIEW_SWAP_MS,
		theme: request.theme,
		themeColors: request.theme === undefined ? undefined : rendererHost().themeColors,
	};
}

/**
 * The comparison a picture is read against, and the page around it.
 * @param request What the render asks for.
 * @param plain Whether the picture leaves out its comparison's marks.
 * @returns The page's part of a paint request.
 */
function pageRequest(request: DiagramRenderRequest, plain: boolean): PageRequest {
	return {
		standing: request.standing,
		plain,
		unsettled: request.unsettled ?? [],
		unbuilt: request.unbuilt === true,
		frame: request.frame,
	};
}

/**
 * The path data of every icon a picture can draw that this host has: each
 * icon its appearances name, and the renderer's own.
 * @param appearances The picture's node appearances, or the policy's node kinds it can draw.
 * @returns Each icon's paths, by export name.
 */
function iconsFor(
	appearances: Iterable<Pick<NodeAppearance, "icon">>,
): Record<string, readonly string[]> {
	const host = rendererHost();
	const names = new Set([...OWN_ICONS, ...[...appearances].map(({ icon }) => icon)]);
	const icons: Record<string, readonly string[]> = {};
	for (const name of names) {
		const paths = host.iconPaths(name);
		if (paths !== undefined) icons[name] = paths;
	}
	return icons;
}

/**
 * Each group's colour, for a group that has one.
 * @param policy The vault's presentation policy.
 * @returns The colours, by group id.
 */
function groupColours(policy: SemanticPolicy): Record<string, PaletteColor> {
	return Object.fromEntries(Object.entries(policy.groups).map(([id, { color }]) => [id, color]));
}

/**
 * One picture, painted by the core and written as an SVG document.
 * @param request Everything the picture is painted from.
 * @returns The document, its size, its atlas and what it placed.
 */
function paintDocument(request: PaintRequest): PaintedDocument {
	const core = rendererHost().core();
	// The core writes what its Rust `PaintedDocument` type says, and the type
	// here is generated from it.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	return JSON.parse(core.paintDocument(JSON.stringify(request))) as PaintedDocument;
}

export { documentRequest, groupColours, iconsFor, pageRequest, paintDocument };
