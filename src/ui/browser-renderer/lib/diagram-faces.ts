// The diagram's faces, loaded into this page before anything is measured.
//
// The browser's canvas measures a word in whatever face its `font` names, and a
// face that is declared but not yet loaded measures as the fallback — a
// different font, and boxes that then do not fit their words. So the four faces
// a picture registers are added to the page under the same family names and
// weights, from the same files the picture links, and every render waits until
// all four have loaded.

import { FACES, FONT_URL_PREFIX } from "@/transformers/semantic-renderer/host";

let loading: Promise<void> | undefined;

/**
 * Load the diagram faces into this page once; later calls share the first load.
 * @param fonts The page's font set.
 * @returns Settles when every face has loaded, and rejects when one could not.
 */
function loadDiagramFaces(fonts: FontFaceSet = document.fonts): Promise<void> {
	loading ??= Promise.all(
		FACES.map(async (face) => {
			const loaded = await new FontFace(face.cssFamily, `url("${FONT_URL_PREFIX}/${face.file}")`, {
				weight: String(face.font.weight),
				style: "normal",
			}).load();
			fonts.add(loaded);
		}),
	).then(() => undefined);
	return loading;
}

export { loadDiagramFaces };
