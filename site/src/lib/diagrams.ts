// Every drawing on the site is Archboard renderer output. The README's drawings come from
// docs/readme (made by `bun run readme:assets`), and the others from site/scripts/render-diagrams.sh.

import architectureRaw from "../../../docs/readme/architecture-dark.svg?raw";
import architectureUrl from "../../../docs/readme/architecture-dark.svg?url";
import sequenceRaw from "../../../docs/readme/sequence-dark.svg?raw";
import sequenceUrl from "../../../docs/readme/sequence-dark.svg?url";
import webShopRaw from "../../../docs/readme/web-shop-dark.svg?raw";
import webShopUrl from "../../../docs/readme/web-shop-dark.svg?url";
import checkoutRaw from "../diagrams/checkout-api.svg?raw";
import checkoutUrl from "../diagrams/checkout-api.svg?url";
import inventoryRaw from "../diagrams/inventory-service.svg?raw";
import inventoryUrl from "../diagrams/inventory-service.svg?url";
import liveEventsRaw from "../diagrams/live-events.svg?raw";
import liveEventsUrl from "../diagrams/live-events.svg?url";
import nightlyBatchRaw from "../diagrams/nightly-batch.svg?raw";
import nightlyBatchUrl from "../diagrams/nightly-batch.svg?url";
import flowchartRaw from "../diagrams/place-order-flowchart.svg?raw";
import flowchartUrl from "../diagrams/place-order-flowchart.svg?url";
import orderSequenceRaw from "../diagrams/place-order-sequence.svg?raw";
import orderSequenceUrl from "../diagrams/place-order-sequence.svg?url";
import queuedRaw from "../diagrams/queued-fulfilment.svg?raw";
import queuedUrl from "../diagrams/queued-fulfilment.svg?url";

export interface Drawing {
	/** The address of the SVG file. */
	url: string;
	/** The SVG's own size, in its units. */
	width: number;
	height: number;
	/** What the renderer says the drawing shows. */
	label: string;
	/** The file's text, for a drawing the page lays inline. */
	raw: string;
}

/**
 * Read a drawing's size and label from the SVG the renderer wrote.
 * @param url The file's address.
 * @param raw The file's text.
 * @returns The drawing.
 */
function drawing(url: string, raw: string): Drawing {
	const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(raw);
	const label = /aria-label="([^"]*)"/.exec(raw);
	if (!viewBox) throw new Error(`No viewBox in ${url}`);
	return {
		url,
		raw,
		width: Number(viewBox[1]),
		height: Number(viewBox[2]),
		label: label?.[1] ?? "",
	};
}

export const drawings = {
	webShop: drawing(webShopUrl, webShopRaw),
	architecture: drawing(architectureUrl, architectureRaw),
	sequence: drawing(sequenceUrl, sequenceRaw),
	queued: drawing(queuedUrl, queuedRaw),
	nightlyBatch: drawing(nightlyBatchUrl, nightlyBatchRaw),
	liveEvents: drawing(liveEventsUrl, liveEventsRaw),
	inventory: drawing(inventoryUrl, inventoryRaw),
	checkout: drawing(checkoutUrl, checkoutRaw),
	flowchart: drawing(flowchartUrl, flowchartRaw),
	orderSequence: drawing(orderSequenceUrl, orderSequenceRaw),
} satisfies Record<string, Drawing>;

/**
 * Prepare an SVG to lie inline in the page. Each drawing names its gradients, masks and markers
 * with ids of its own, so two drawings on one page would share ids: every id and every reference
 * to one gets the prefix.
 * @param raw The SVG text.
 * @param prefix A prefix unique on the page.
 * @returns The SVG text with its ids prefixed.
 */
export function inline(raw: string, prefix: string): string {
	return raw
		.replace(/<\?xml[^>]*>/, "")
		.replace(/(\s)id="([^"]+)"/g, `$1id="${prefix}-$2"`)
		.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
		.replace(/(\s)(xlink:href|href)="#([^"]+)"/g, `$1$2="#${prefix}-$3"`);
}

/**
 * Find a card's box in a drawing, in the drawing's own units.
 * @param raw The SVG text.
 * @param id The module's qualified identity.
 * @returns The box of the card's face.
 */
export function cardBox(
	raw: string,
	id: string,
): { x: number; y: number; width: number; height: number } {
	const at = raw.indexOf(`data-semantic-kind="node" data-semantic-id="${id}"`);
	const rect = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
		raw.slice(at),
	);
	if (at < 0 || !rect) throw new Error(`No card ${id}`);
	return {
		x: Number(rect[1]),
		y: Number(rect[2]),
		width: Number(rect[3]),
		height: Number(rect[4]),
	};
}
