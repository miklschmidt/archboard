// The realtime voice adapter: it starts a voice session on a thread and narrates a walkthrough through it. Bun only.
export type {
	RealtimePresentation,
	RealtimePresentationChange,
	StepSubject,
} from "#runtime/rules/realtime/presentation-mode.ts";
export { createCodexRealtimeAdapter } from "#runtime/services/realtime/adapter.ts";
export type {
	CodexRealtimeAdapter,
	CodexRealtimeAdapterOptions,
	CodexRealtimeBinding,
	CodexRealtimeGeneration,
} from "#runtime/services/realtime/contract.ts";
