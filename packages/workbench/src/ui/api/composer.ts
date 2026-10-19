// The composer's controller: the one place the official assistant-ui composer submits through, and the result of a submission. Safe for the browser.
export type {
	WorkbenchComposerController,
	WorkbenchComposerSubmissionResult,
} from "#ui/state/composer/contract.ts";
export { createWorkbenchComposerController } from "#ui/state/composer/controller.ts";
