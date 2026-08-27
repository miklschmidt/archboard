import type { BinaryFileData } from "@excalidraw/excalidraw/types";

interface CanvasFileOwner {
	getFiles(): Record<string, BinaryFileData>;
	addFiles(files: BinaryFileData[]): void;
}

/** Replace file membership before Excalidraw's deliberately additive addFiles call. */
export function replaceCanvasFiles(owner: CanvasFileOwner, files: BinaryFileData[]): void {
	const current = owner.getFiles();
	for (const id of Object.keys(current)) delete current[id];
	owner.addFiles(files);
}
