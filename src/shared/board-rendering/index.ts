import type { RuntimeBoardElement } from "../board-elements/index.js";

export interface BoardRenderFile {
	readonly id: string;
	readonly dataURL: string;
	readonly mimeType: string;
	readonly created: number;
}

/** One validated persisted scene crossing the server-to-renderer boundary. */
export interface BoardRenderSnapshot {
	readonly elements: readonly RuntimeBoardElement[];
	readonly files: Readonly<Record<string, BoardRenderFile>>;
	readonly appState: { readonly viewBackgroundColor: string };
}
