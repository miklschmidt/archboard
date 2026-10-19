// Flows: the step shapes, the message kinds and the reading of a flow's steps.
export { everyStep, isMessage, messagesOf, stepWords } from "#shared/rules/flow-steps.ts";
export type {
	FlowDecision,
	FlowLoop,
	FlowMessage,
	FlowStep,
	SemanticFlow,
} from "#shared/schemas/views.ts";
export type { MessageKind } from "#shared/schemas/vocabulary.ts";
