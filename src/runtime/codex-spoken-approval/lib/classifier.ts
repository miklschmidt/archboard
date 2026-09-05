import { createHash } from "node:crypto";

import { boundedWireText } from "../../../shared/codex-browser-model/index.js";

const SPOKEN_APPROVAL_CLASSIFIER_SHA256 =
	"215bd565500a9188f5e8f0d920a078113937f36296535054c56d7f12d74d1c6f";

/** The reviewed template, including its one terminal LF. */
const SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE =
	"Classify one spoken binary approval for Archboard. The host has already bound the request identity; do not infer or mention another request.\n\n" +
	"<spoken_approval>\n" +
	"effect: <bounded-effect-summary>\n" +
	"user_final_item_id: <opaque-item-id>\n" +
	"user_final_sequence: <decimal-sequence>\n" +
	"user_final_text: <verbatim-bounded-final-user-text>\n" +
	"</spoken_approval>\n\n" +
	'If and only if the user clearly accepts or declines this effect, call archboard_voice.resolve_spoken_approval once with {"verdict":"accept"} or {"verdict":"decline"}. Otherwise do not call the tool; say the request must be resolved in the visual workbench.\n';

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

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
	readonly effectSummary: string;
	readonly finalUserItemId: string;
	readonly finalUserSequence: number;
	readonly finalUserText: string;
}

function oneLine(value: string, label: string): string {
	const bounded = boundedWireText(256).parse(value);
	if (bounded.length === 0 || bounded.includes("\r") || bounded.includes("\n")) {
		throw new TypeError(`${label} must be a non-empty one-line value.`);
	}
	return bounded;
}

function createSpokenApprovalClassifierPrompt(input: SpokenApprovalClassifierPromptInput): string {
	const effectSummary = oneLine(input.effectSummary, "effect summary");
	const finalUserItemId = oneLine(input.finalUserItemId, "final user item id");
	if (!Number.isSafeInteger(input.finalUserSequence) || input.finalUserSequence < 0) {
		throw new TypeError("final user sequence must be a non-negative safe integer.");
	}
	const finalUserText = boundedWireText(16_384).parse(input.finalUserText);
	const replacements: Readonly<Record<string, string>> = {
		"<bounded-effect-summary>": effectSummary,
		"<opaque-item-id>": finalUserItemId,
		"<decimal-sequence>": String(input.finalUserSequence),
		"<verbatim-bounded-final-user-text>": finalUserText,
	};
	return SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE.replace(
		/<bounded-effect-summary>|<opaque-item-id>|<decimal-sequence>|<verbatim-bounded-final-user-text>/g,
		(placeholder) => replacements[placeholder] ?? placeholder,
	);
}

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
