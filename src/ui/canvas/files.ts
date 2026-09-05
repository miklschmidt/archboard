// Replacing a canvas's files. Excalidraw's `addFiles` is deliberately
// additive, so a replacement frame first empties what the canvas holds.

import type { BinaryFileData } from "@excalidraw/excalidraw/types";

/** The two file operations Excalidraw's API offers a pane. */
interface CanvasFileOwner {
	getFiles(): Record<string, BinaryFileData>;
	addFiles(files: BinaryFileData[]): void;
}

/**
 * Replace file membership before Excalidraw's additive `addFiles` call.
 * @param owner The canvas whose files are replaced.
 * @param files The files the board now draws.
 */
function replaceCanvasFiles(owner: CanvasFileOwner, files: BinaryFileData[]): void {
	const current = owner.getFiles();
	for (const id of Object.keys(current)) {
		// Excalidraw hands out its own record; emptying it is the replacement.
		delete current[id];
	}
	owner.addFiles(files);
}

export { type CanvasFileOwner, replaceCanvasFiles };
