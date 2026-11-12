// Record this process's usage (ADR 0079): one record for each CLI command, one for each
// unexpected error, and the environment that makes the workbench's Codex record alike.
export {
	recordCommand,
	recordError,
	workbenchTelemetryEnvironment,
} from "#runtime/records/operations/record.ts";
