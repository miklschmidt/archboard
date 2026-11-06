import { createContext } from "react";
import type { UserMarks } from "#ui/panes/pane-session/state/user-marks.ts";
import type { PaneReading } from "#ui/panes/pane-session/state/pane-reading.ts";
import type { ExplanationInvocation } from "#ui/clients/architecture-model/explanations.ts";

const ModelExplanationContext = createContext<{
	userChanged: UserMarks["mark"];
	invoke: (vault: string, input: ExplanationInvocation) => void;
	report: (reading: PaneReading | null) => void;
	pending: boolean;
} | null>(null);

export { ModelExplanationContext };
