import { createContext } from "react";
import type { UserMarks } from "#ui/panes/pane-session/state/user-marks.ts";
import type { PaneReading } from "#ui/panes/pane-session/state/pane-reading.ts";
import type {
	ExplanationActionRequest,
	ExplanationActionResult,
} from "@archboard/workbench/browser-contract";

/** What a reader asks to have explained, as the pane's tab sends it. */
type ExplanationInvocation = Omit<
	Extract<ExplanationActionRequest, { type: "invoke" }>,
	"type" | "tabSessionId"
>;
/** One explanation action, as the server reports it. */
type ExplanationAction = Extract<ExplanationActionResult, { success: true }>["action"];

const ModelExplanationContext = createContext<{
	userChanged: UserMarks["mark"];
	invoke: (vault: string, input: ExplanationInvocation) => void;
	report: (reading: PaneReading | null) => void;
	pending: boolean;
} | null>(null);

export { ModelExplanationContext, type ExplanationAction, type ExplanationInvocation };
