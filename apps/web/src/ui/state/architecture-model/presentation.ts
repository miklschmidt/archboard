import { createContext } from "react";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";

/** Ordinary pane presentation, independent of asynchronous architecture reads. */
const ModelPaneContext = createContext<{ selection: ModelSelection; sidebar: Sidebar } | null>(
	null,
);

/** The captured presentation owns its start action and whether it replaces ordinary reading. */
const ModelWalkthroughContext = createContext<{
	select: (id: string) => void;
	active: boolean;
} | null>(null);

export { ModelPaneContext, ModelWalkthroughContext };
