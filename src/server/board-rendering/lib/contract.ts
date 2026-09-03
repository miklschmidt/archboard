import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { MermaidConfig } from "@excalidraw/mermaid-to-excalidraw";
import type { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

import type { BoardRenderSnapshot } from "../../../shared/board-rendering/index.js";

export const DEFAULT_MERMAID_CONFIG: MermaidConfig = {
	startOnLoad: false,
	flowchart: { curve: "linear" },
	themeVariables: { fontSize: "20px" },
	maxEdges: 500,
	maxTextSize: 50_000,
};

export type { BoardRenderSnapshot } from "../../../shared/board-rendering/index.js";

export type MermaidParserResult = Awaited<ReturnType<typeof parseMermaidToExcalidraw>>;
export type MermaidSkeleton = ExcalidrawElementSkeleton;

export interface FullBoardRenderSpec {
	readonly id: string;
	readonly kind: "full";
	readonly format: "png" | "svg";
	readonly background: boolean;
	readonly padding: number;
	readonly scale: number;
}

export interface FocusedBoardRenderSpec {
	readonly id: string;
	readonly kind: "focus";
	readonly format: "png";
	readonly background: true;
	readonly frame: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	};
	readonly width: number;
	readonly height: number;
	readonly scale: number;
}

export type BoardRenderSpec = FullBoardRenderSpec | FocusedBoardRenderSpec;

export interface BoardRenderJob {
	readonly kind: "render";
	readonly snapshot: BoardRenderSnapshot;
	readonly outputs: readonly BoardRenderSpec[];
}

export interface MermaidRenderJob {
	readonly kind: "mermaid";
	readonly source: string;
	readonly config: MermaidConfig;
}

export type BoardRendererJob = BoardRenderJob | MermaidRenderJob;

export interface BoardRenderOutput {
	readonly id: string;
	readonly format: "png" | "svg";
	readonly data: string;
	readonly width: number;
	readonly height: number;
}

export interface BoardRenderJobResult {
	readonly kind: "render";
	readonly outputs: readonly BoardRenderOutput[];
	readonly error?: string;
}

export interface MermaidRenderJobResult {
	readonly kind: "mermaid";
	readonly elements: readonly MermaidSkeleton[];
	readonly files: BinaryFiles;
	readonly error?: string;
}

export type BoardRendererJobResult = BoardRenderJobResult | MermaidRenderJobResult;

export interface RendererPageState {
	readonly phase: string;
	readonly active: boolean;
	readonly jobs: number;
}

export interface BrowserRendererEntry {
	readonly state: RendererPageState;
	run(job: BoardRendererJob): Promise<BoardRendererJobResult>;
}

declare global {
	interface Window {
		archboardBoardRenderer?: BrowserRendererEntry;
	}
}
