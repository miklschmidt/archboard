// What a person can choose on an approval card, and the two actions that send
// a choice. The controller encodes the wire response; a card offers only what
// the approval allows.

import type { CodexCommandExecutionApprovalDecision } from "@archboard/codex-app-server/contract";
import type { DYNAMIC_APPROVAL_DECISIONS } from "#shared/schemas/dynamic-approval/effects.ts";
import type { BrowserApproval } from "#shared/schemas/browser/snapshot.ts";
import type { BrowserDynamicApproval } from "#shared/schemas/dynamic-approval/approval.ts";

/** A verdict on a dynamic coordination approval, as the shared model spells it. */
type DynamicApprovalVerdict = (typeof DYNAMIC_APPROVAL_DECISIONS)[number];

/** A decision on one approval, as the model defines it. */
type ApprovalChoice =
	| { kind: "command_decision"; decision: CodexCommandExecutionApprovalDecision }
	| { kind: "file_change_decision"; decision: "accept" | "acceptForSession" | "decline" | "cancel" }
	| { kind: "answer"; questionId: string; answer: string }
	| { kind: "approve" }
	| { kind: "decline" };

/** The two actions an approval card calls. */
interface ApprovalCardActions {
	readonly respondToApproval: (approval: BrowserApproval, choice: ApprovalChoice) => void;
	readonly respondToDynamicApproval: (
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	) => void;
}

export type { ApprovalCardActions, ApprovalChoice, DynamicApprovalVerdict };
