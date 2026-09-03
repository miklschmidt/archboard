import type { CodexResponseByMethod } from "../../shared/codex-app-server-contract/index.js";
import type { BrowserTimeline } from "../../shared/codex-browser-model/index.js";

export type CodexWorkbenchThread = CodexResponseByMethod["thread/read"]["thread"];
export type CodexWorkbenchTurn = CodexWorkbenchThread["turns"][number];
export type CodexWorkbenchItem = CodexWorkbenchTurn["items"][number];
export type WorkbenchTimelineRuntime = BrowserTimeline;

export interface WorkbenchTimelineProps {
	/** Stable app-server thread identity shared with the mounted assistant runtime. */
	readonly threadId: CodexWorkbenchThread["id"];
	/** Complete decoded app-server turns. The assistant runtime supplies their mounted order. */
	readonly turns: readonly CodexWorkbenchTurn[];
	/** Browser projection used for approval events and terminal state while turns stream. */
	readonly runtimeTimeline?: WorkbenchTimelineRuntime | null;
	readonly history?: "current" | "prior_epoch";
	readonly label?: string;
	readonly className?: string;
}
