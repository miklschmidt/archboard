// The Codex workbench the server prepares and stops, and the explanations it answers.
export {
	prepareCodexWorkbench,
	stopCodexWorkbench,
} from "#server/workbench-host/services/wiring.ts";

export { explainArchitecture } from "#server/explanations/services/dispatch.ts";
