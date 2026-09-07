import { CodexApprovalError } from "@/runtime/codex-approvals/lib/contract";
import type {
	ApprovalFamily,
	ApprovalRequest,
	CommandApprovalRequest,
	SpokenApprovalEffectPresentation,
	SpokenEligibility,
	SpokenEligibilityFacts,
} from "@/runtime/codex-approvals/lib/contract";
import {
	effectiveCommandDecisions,
	isRecord,
	type RecordValue,
} from "@/runtime/codex-approvals/lib/response";

/** The scalar JSON Schema types a person can answer aloud. */
const SPOKEN_SCALAR_TYPES: ReadonlySet<string> = new Set([
	"string",
	"number",
	"integer",
	"boolean",
]);

/**
 * Whether every entry of a list is a plain string.
 * @param values - The candidate list.
 * @returns True when the list holds only strings.
 */
function allStrings(values: readonly unknown[]): boolean {
	return values.every((entry) => typeof entry === "string");
}

/**
 * Whether every entry of a list is a schema pinned to one string constant.
 * @param values - The candidate list.
 * @returns True when every entry is a string constant.
 */
function allStringConstants(values: readonly unknown[]): boolean {
	return values.every((entry) => isRecord(entry) && typeof entry["const"] === "string");
}

/**
 * Whether one array property can be answered aloud: its items must be a closed set of strings,
 * because a person cannot dictate an arbitrary structure.
 * @param definition - The property's schema.
 * @returns True when the array's items are a closed string set.
 */
function supportsSpokenArray(definition: RecordValue): boolean {
	const items = definition["items"];
	if (definition["type"] !== "array" || !isRecord(items)) {
		return false;
	}
	if (Array.isArray(items["enum"])) {
		return allStrings(items["enum"]);
	}
	return Array.isArray(items["anyOf"]) && allStringConstants(items["anyOf"]);
}

/**
 * Whether one form property can be answered aloud: a scalar, a closed set of strings, or an array
 * of those.
 * @param name - The property's name.
 * @param definition - The property's schema.
 * @returns True when the property is answerable aloud.
 */
function supportsSpokenProperty(name: string, definition: unknown): boolean {
	if (!isSpokenPropertyName(name) || !isRecord(definition)) {
		return false;
	}
	if (SPOKEN_SCALAR_TYPES.has(String(definition["type"]))) {
		return true;
	}
	if (Array.isArray(definition["enum"])) {
		return allStrings(definition["enum"]);
	}
	return Array.isArray(definition["oneOf"])
		? allStringConstants(definition["oneOf"])
		: supportsSpokenArray(definition);
}

/**
 * Whether a form property's name could be spoken at all.
 * @param name - The property name.
 * @returns True for a non-empty name with no embedded null.
 */
function isSpokenPropertyName(name: string): boolean {
	return name.length > 0 && !name.includes("\0");
}

/**
 * Whether an elicitation form could be answered aloud at all. Archboard does not resolve forms by
 * voice, but the shape decides which refusal the person is told.
 * @param schema - The requested form schema.
 * @returns True when every property is answerable aloud.
 */
function supportsSpokenFormSchema(schema: unknown): boolean {
	if (!isRecord(schema) || !isRecord(schema["properties"])) {
		return false;
	}
	return Object.entries(schema["properties"]).every(([name, definition]) =>
		supportsSpokenProperty(name, definition),
	);
}

/**
 * Text that can safely be read aloud and compared exactly: non-empty, bounded, and single-line.
 * @param value - The candidate text.
 * @returns The text, or null when it cannot be spoken.
 */
function spokenText(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	if (value.length === 0 || value.length > 256) {
		return null;
	}
	if (value.includes("\r") || value.includes("\n")) {
		return null;
	}
	return value;
}

/**
 * Refuse a command approval that carries an effect the spoken summary would not mention: another
 * execution environment, or network access. What is read aloud must be the whole effect.
 * @param request - The command approval request.
 * @throws {CodexApprovalError} When the command carries an undisclosed effect.
 */
function assertNoUndisclosedEffect(request: CommandApprovalRequest): void {
	if (request.params.environmentId !== null) {
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval targets an undisclosed execution environment.",
			request.requestId,
		);
	}
	if (
		request.params.networkApprovalContext !== undefined &&
		request.params.networkApprovalContext !== null
	) {
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval includes an undisclosed network effect.",
			request.requestId,
		);
	}
}

/**
 * The one line a person is read before answering a command approval aloud: the exact command and
 * where it runs. A command that cannot be summarised safely in one line is refused, because the
 * spoken gate is armed against these exact words.
 * @param request - The command approval request.
 * @returns The spoken effect summary.
 * @throws {CodexApprovalError} When the command has no safe one-line summary.
 */
function spokenCommandEffectSummary(request: CommandApprovalRequest): string {
	if (request.params.command === undefined || request.params.command === null) {
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval has no executable command for spoken presentation.",
			request.requestId,
		);
	}
	const command = spokenText(request.params.command);
	const cwd = spokenText(request.params.cwd);
	if (command === null || cwd === null) {
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval has no safe one-line executable effect presentation.",
			request.requestId,
		);
	}
	assertNoUndisclosedEffect(request);
	const summary = `Run ${command} in ${cwd}`;
	const bounded = spokenText(summary);
	if (bounded === null) {
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval has no safe one-line spoken effect presentation.",
			request.requestId,
		);
	}
	return bounded;
}

/**
 * The effect presentation a spoken gate is armed on: this approval's identities, its binding, and
 * the line the person is read. Only command approvals have one.
 * @param request - The approval request.
 * @returns The frozen presentation.
 * @throws {CodexApprovalError} When the request is not a command approval.
 */
function toSpokenEffectPresentation(request: ApprovalRequest): SpokenApprovalEffectPresentation {
	if (request.family !== "command_execution") {
		throw new CodexApprovalError(
			"unsupported_request",
			"Only command approvals have a spoken effect presentation.",
			request.requestId,
		);
	}
	return Object.freeze({
		requestId: request.requestId,
		family: request.family,
		child: request.child,
		epoch: request.epoch,
		threadId: request.threadId,
		turnId: request.turnId,
		itemId: request.itemId,
		approvalId: request.approvalId,
		binding: request.binding,
		effectSummary: spokenCommandEffectSummary(request),
	});
}

/**
 * Why an approval cannot be spoken whatever its family: it holds a secret, the coordinator is
 * blocked on it, its schema or grant is broader than a spoken yes-or-no, its spoken presentation
 * could not be built, or the binding it was made under is no longer current.
 * @param request - The approval request.
 * @param currentBinding - Whether the binding is still the host's current one.
 * @param facts - What the host knows about the approval.
 * @param effectPresentation - The spoken presentation, when one could be built.
 * @returns The refusal, or null when the family's own rules decide.
 */
function spokenFactsRefusal(
	request: ApprovalRequest,
	currentBinding: boolean,
	facts: SpokenEligibilityFacts,
	effectPresentation: SpokenApprovalEffectPresentation | null,
): SpokenEligibility | null {
	if (facts.secret === true || holdsSecretQuestion(request)) {
		return { eligible: false, reason: "secret" };
	}
	const factRefusal =
		hostFactRefusal(facts) ?? missingPresentationRefusal(request, effectPresentation);
	if (factRefusal !== null) {
		return factRefusal;
	}
	return currentBinding ? null : { eligible: false, reason: "stale_ownership" };
}

/**
 * The refusal for a command approval whose spoken presentation could not be built: without the
 * exact line the person would be read, there is nothing to arm a gate against.
 * @param request - The approval request.
 * @param effectPresentation - The spoken presentation, when one could be built.
 * @returns The refusal, or null.
 */
function missingPresentationRefusal(
	request: ApprovalRequest,
	effectPresentation: SpokenApprovalEffectPresentation | null,
): SpokenEligibility | null {
	return request.family === "command_execution" && effectPresentation === null
		? { eligible: false, reason: "unsupported_schema" }
		: null;
}

/**
 * Whether an approval asks the person for something secret, which must never be read aloud or
 * answered aloud.
 * @param request - The approval request.
 * @returns True when any question is secret.
 */
function holdsSecretQuestion(request: ApprovalRequest): boolean {
	return (
		request.family === "user_input" &&
		request.params.questions.some((question) => question.isSecret)
	);
}

/**
 * Why the host's own facts rule voice out for this approval.
 * @param facts - What the host knows about the approval.
 * @returns The refusal, or null when the host's facts allow voice.
 */
function hostFactRefusal(facts: SpokenEligibilityFacts): SpokenEligibility | null {
	if (facts.coordinatorBlocking === true) {
		return { eligible: false, reason: "coordinator_blocking" };
	}
	if (facts.unsupportedSchema === true) {
		return { eligible: false, reason: "unsupported_schema" };
	}
	return facts.broaderGrant === true ? { eligible: false, reason: "broader_grant" } : null;
}

/**
 * Whether a command approval would grant anything beyond running the command it names: extra
 * permissions, or a policy amendment. A spoken yes may only ever mean the one effect that was
 * read aloud.
 * @param request - The command approval request.
 * @returns True when the approval would grant something broader.
 */
function grantsBeyondCommand(request: CommandApprovalRequest): boolean {
	const grants = [
		request.params.additionalPermissions ?? null,
		request.params.proposedExecpolicyAmendment?.length ?? 0,
		request.params.proposedNetworkPolicyAmendments?.length ?? 0,
	];
	return grants.some((grant) => grant !== null && grant !== 0);
}

/**
 * Whether a command approval offers exactly the binary choice a spoken answer can make: accept or
 * decline, and nothing else.
 * @param request - The command approval request.
 * @returns True when the offered decisions are exactly accept and decline.
 */
function offersBinaryDecision(request: CommandApprovalRequest): boolean {
	const available = effectiveCommandDecisions(request);
	return available.length === 2 && available.includes("accept") && available.includes("decline");
}

/**
 * Whether one command approval may be answered aloud: it must run a command, grant nothing
 * broader, and offer exactly accept or decline.
 * @param request - The command approval request.
 * @returns The eligibility.
 */
function commandSpokenEligibility(request: CommandApprovalRequest): SpokenEligibility {
	if (request.params.kind !== "command") {
		return { eligible: false, reason: "not_binary" };
	}
	if (grantsBeyondCommand(request)) {
		return { eligible: false, reason: "broader_grant" };
	}
	return offersBinaryDecision(request)
		? { eligible: true, reason: "eligible" }
		: { eligible: false, reason: "broader_grant" };
}

/**
 * Why a user-input request cannot be answered aloud, which depends on whether the coordinator is
 * blocked on it and how many questions it asks.
 * @param request - The user-input request.
 * @returns The refusal.
 */
function userInputSpokenEligibility(
	request: Extract<ApprovalRequest, { readonly family: "user_input" }>,
): SpokenEligibility {
	if (request.params.isBlocking) {
		return { eligible: false, reason: "coordinator_blocking" };
	}
	if (request.params.questions.length !== 1) {
		return { eligible: false, reason: "multi_question" };
	}
	return { eligible: false, reason: "not_binary" };
}

/**
 * Why an elicitation cannot be answered aloud: a form whose fields could not be dictated at all
 * is reported as an unsupported schema, and everything else as the form or link it is.
 * @param request - The elicitation request.
 * @returns The refusal.
 */
function elicitationSpokenEligibility(
	request: Extract<ApprovalRequest, { readonly family: "elicitation" }>,
): SpokenEligibility {
	if (
		request.params.mode === "openai/form" &&
		!supportsSpokenFormSchema(request.params.requestedSchema)
	) {
		return { eligible: false, reason: "unsupported_schema" };
	}
	return { eligible: false, reason: request.params.mode === "url" ? "url" : "form" };
}

/**
 * Why the families that are never spoken cannot be: a file change grants more than the words
 * describe, a permissions request is about scope rather than one effect, and the patch and
 * command families are not a binary yes or no.
 * @param family - The approval family.
 * @returns The refusal.
 */
function visualOnlyEligibility(
	family: Exclude<ApprovalFamily, "command_execution" | "user_input" | "elicitation">,
): SpokenEligibility {
	if (family === "file_change") {
		return { eligible: false, reason: "broader_grant" };
	}
	return family === "permissions"
		? { eligible: false, reason: "permission_scope" }
		: { eligible: false, reason: "not_binary" };
}

/**
 * Whether one approval may be resolved by voice, and when it may not, why. Only a command
 * execution that offers exactly accept or decline is ever eligible; every other family is
 * answered on the visual surface, and each says which of its own properties rules voice out.
 * @param request - The approval request.
 * @param currentBinding - Whether the binding is still the host's current one.
 * @param facts - What the host knows about the approval.
 * @param effectPresentation - The spoken presentation, when one could be built.
 * @returns The eligibility and its reason.
 */
function spokenEligibility(
	request: ApprovalRequest,
	currentBinding: boolean,
	facts: SpokenEligibilityFacts,
	effectPresentation: SpokenApprovalEffectPresentation | null,
): SpokenEligibility {
	const refusal = spokenFactsRefusal(request, currentBinding, facts, effectPresentation);
	if (refusal !== null) {
		return refusal;
	}
	if (request.family === "command_execution") {
		return commandSpokenEligibility(request);
	}
	if (request.family === "user_input") {
		return userInputSpokenEligibility(request);
	}
	if (request.family === "elicitation") {
		return elicitationSpokenEligibility(request);
	}
	return visualOnlyEligibility(request.family);
}

export { spokenEligibility, toSpokenEffectPresentation };
