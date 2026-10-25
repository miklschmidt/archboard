import { createHash } from "node:crypto";

import { boundedWireText } from "#shared/schemas/browser/scalars.ts";

const SPOKEN_APPROVAL_CLASSIFIER_SHA256 =
	"b0c910734cc79a8600cc549d6fd59f0783f2abf8676e9a03fba1a0a734e8a573";

/** The reviewed template, including its one terminal LF. */
const SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE =
	"Classify one spoken binary approval for <product-name>. The <product-name> server has already bound the request identity; do not infer or mention another request.\n\n" +
	"<spoken_approval>\n" +
	"effect: <bounded-effect-summary>\n" +
	"user_final_item_id: <opaque-item-id>\n" +
	"user_final_sequence: <decimal-sequence>\n" +
	"user_final_text: <verbatim-bounded-final-user-text>\n" +
	"</spoken_approval>\n\n" +
	'If and only if the user clearly accepts or declines this effect, call <voice-namespace>.resolve_spoken_approval once with {"verdict":"accept"} or {"verdict":"decline"}. Otherwise do not call the tool; say the request must be resolved in the visual workbench.\n';

/**
 * The SHA-256 of some text, which is how the classifier template's integrity is stated.
 * @param value - The text to hash.
 * @returns The hex digest.
 */
function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Refuse a classifier template that is not byte-for-byte the reviewed one. The template is what asks a model to decide an approval, so it is pinned by digest and a drift is a refusal rather than an update.
 * @param value - The template text.
 * @throws {TypeError} When the endings, terminator or digest are not the reviewed ones.
 */
function assertCanonicalTemplate(value: string): void {
	if (value.includes("\r")) {
		throw new TypeError("The spoken approval classifier must use LF endings.");
	}
	if (!value.endsWith("\n") || value.endsWith("\n\n")) {
		throw new TypeError("The spoken approval classifier must end in exactly one LF.");
	}
	const actual = sha256(value);
	if (actual !== SPOKEN_APPROVAL_CLASSIFIER_SHA256) {
		throw new TypeError(
			`The spoken approval classifier hash drifted. Expected ${SPOKEN_APPROVAL_CLASSIFIER_SHA256}, received ${actual}. Human re-review is required before updating this digest.`,
		);
	}
}

assertCanonicalTemplate(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE);

interface SpokenApprovalClassifierPromptInput {
	/** What the user talks with, as the host names it. */
	readonly productName: string;
	/** The host's name of the namespace that holds resolve_spoken_approval. */
	readonly voiceNamespace: string;
	readonly effectSummary: string;
	readonly finalUserItemId: string;
	readonly finalUserSequence: number;
	readonly finalUserText: string;
}

/**
 * Prove a value is bounded and single-line before it is placed into the classifier prompt: a multi-line value could otherwise forge extra prompt structure.
 * @param value - The claimed value.
 * @param label - The field being checked, for the refusal message.
 * @returns The bounded value.
 * @throws {TypeError} When the value is empty or multi-line.
 */
function oneLine(value: string, label: string): string {
	const bounded = boundedWireText(256).parse(value);
	if (bounded.length === 0 || bounded.includes("\r") || bounded.includes("\n")) {
		throw new TypeError(`${label} must be a non-empty one-line value.`);
	}
	return bounded;
}

/**
 * Fill the reviewed classifier template with this approval's effect and the person's exact words. Every placeholder is replaced by one bounded value, so the prompt's structure is fixed by the template rather than by anything the person said.
 * @param input - The effect summary and the person's final utterance.
 * @returns The prompt text.
 * @throws {TypeError} When any field is not a bounded value.
 */
function createSpokenApprovalClassifierPrompt(input: SpokenApprovalClassifierPromptInput): string {
	const effectSummary = oneLine(input.effectSummary, "effect summary");
	const finalUserItemId = oneLine(input.finalUserItemId, "final user item id");
	if (!Number.isSafeInteger(input.finalUserSequence) || input.finalUserSequence < 0) {
		throw new TypeError("final user sequence must be a non-negative safe integer.");
	}
	const finalUserText = boundedWireText(16_384).parse(input.finalUserText);
	if (!/^[a-z][a-z0-9_]{0,63}$/u.test(input.voiceNamespace)) {
		throw new TypeError("voice namespace must be a namespace name.");
	}
	const replacements: Readonly<Record<string, string>> = {
		"<product-name>": oneLine(input.productName, "product name"),
		"<voice-namespace>": input.voiceNamespace,
		"<bounded-effect-summary>": effectSummary,
		"<opaque-item-id>": finalUserItemId,
		"<decimal-sequence>": String(input.finalUserSequence),
		"<verbatim-bounded-final-user-text>": finalUserText,
	};
	return SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.replace(
		/<product-name>|<voice-namespace>|<bounded-effect-summary>|<opaque-item-id>|<decimal-sequence>|<verbatim-bounded-final-user-text>/g,
		(placeholder) => replacements[placeholder] ?? placeholder,
	);
}

/**
 * Re-check the template's digest at runtime and report it, so a caller can prove the classifier prompt has not drifted since review.
 * @returns The template's digest.
 */
function verifySpokenApprovalClassifierIntegrity(): string {
	assertCanonicalTemplate(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE);
	return sha256(SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE);
}

export {
	SPOKEN_APPROVAL_CLASSIFIER_SHA256,
	SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE,
	type SpokenApprovalClassifierPromptInput,
	createSpokenApprovalClassifierPrompt,
	verifySpokenApprovalClassifierIntegrity,
};
