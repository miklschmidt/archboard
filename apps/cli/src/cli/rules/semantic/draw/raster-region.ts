// The region of a bitmap, held to the page drawn: what `semantic rasterize
// --region` asks for, and what an embed's recipe keeps for `check embeds --fix`.

import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import type { z } from "zod";
import type { PageRegion, SemanticRasterReceiptSchema } from "@archboard/renderer/rasterizer";

/** The diagram's page, as the rasterizer's receipt measures it. */
type SemanticRasterPageSize = z.infer<typeof SemanticRasterReceiptSchema>["diagram"];

/**
 * The requested region, refused when it reaches outside the page: a tile
 * that is partly ground would be a picture of nothing anybody asked for.
 * @param region What was asked for, if anything.
 * @param page The diagram's page.
 * @returns The region, or undefined for the whole page.
 * @throws {CliUsageError} When the region leaves the page.
 */
function regionWithin(
	region: PageRegion | undefined,
	page: SemanticRasterPageSize,
): PageRegion | undefined {
	if (region === undefined) return undefined;
	if (region.x + region.width > page.width || region.y + region.height > page.height) {
		throw new CliUsageError(
			`--region ${region.x},${region.y},${region.width},${region.height} reaches outside the ${page.width}×${page.height} diagram.`,
		);
	}
	return region;
}

export { regionWithin };
