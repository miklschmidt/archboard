import { Buffer } from "node:buffer";
import { copyPngAndHtml } from "@/runtime/image-clipboard/index";

/**
 * Decode the four entities the semantic renderer writes, after collecting text.
 * HTMLRewriter preserves entities in attributes and text chunks. Decode the
 * ampersand last so a literal entity spelling is not decoded a second time.
 * @param text The renderer's escaped text.
 * @returns Its original readable text, without surrounding whitespace.
 */
function rendererText(text: string): string {
	return text
		.replaceAll("&quot;", '"')
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&")
		.trim();
}

/**
 * Preserve the rendered SVG's accessible title and description in the HTML image.
 * @param svg The semantic renderer's SVG document.
 * @param prefix The selected board, variant and view identity.
 * @returns The exact description offered as HTML image alt text.
 */
function imageDescription(svg: string, prefix: string): string {
	let label = "";
	let description = "";
	let rootSeen = false;
	new HTMLRewriter()
		.on("svg", {
			/**
			 * Collect the document's accessible title.
			 * @param element The root SVG element.
			 */
			element(element) {
				if (rootSeen) return;
				rootSeen = true;
				label = element.getAttribute("aria-label") ?? "";
			},
		})
		.on("svg > desc", {
			/**
			 * Collect all chunks before decoding escaped text.
			 * @param chunk One chunk of the accessible description.
			 */
			text(chunk) {
				description += chunk.text;
			},
		})
		.transform(svg);
	return [prefix.trim(), rendererText(label), rendererText(description)].filter(Boolean).join(". ");
}

/**
 * Copy the PNG with the same accessible description in self-contained HTML.
 * @param image The bitmap and the selected picture's accessible metadata.
 * @param image.png The PNG bytes.
 * @param image.width The bitmap width.
 * @param image.height The bitmap height.
 * @param image.svg The SVG carrying accessible metadata.
 * @param image.description The selected board, variant and view identity.
 * @param signal The caller's cancellation signal.
 * @returns The exact description offered as HTML image alt text.
 */
async function copyImageToClipboard(
	image: Omit<Parameters<typeof copyPngAndHtml>[0], "html"> & { svg: string; description: string },
	signal: AbortSignal,
): Promise<string> {
	const png = Buffer.from(image.png).toString("base64");
	const description = imageDescription(image.svg, image.description);
	const html = `<img src="data:image/png;base64,${png}" alt="${Bun.escapeHTML(description)}">`;
	await copyPngAndHtml({ png: image.png, width: image.width, height: image.height, html }, signal);
	return description;
}

export { copyImageToClipboard };
