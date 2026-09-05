import { describe, expect, test } from "bun:test";

import type { BrowserApproval, BrowserSpokenApproval } from "@/shared/codex-browser-model";
import { projectApproval, spokenApprovalLine } from "@/ui/workbench/approval-projection";
import { identities } from "@/ui/workbench/tests/identities";

type CommandApproval = Extract<BrowserApproval, { approvalKind: "command_execution" }>;
type QuestionApproval = Extract<BrowserApproval, { approvalKind: "user_input" }>;

const PENDING: CommandApproval["lifecycle"] = {
	state: "pending",
	decision: null,
	outcome: null,
	reason: null,
};

/** The envelope every approval shares. */
const envelope = {
	kind: "approval" as const,
	requestId: identities.requestId,
	threadId: identities.threadId,
	turnId: identities.turnId,
	itemId: identities.itemId,
	approvalId: identities.approvalId,
	expiresAtMs: 90_000,
	lifecycle: PENDING,
	binding: {
		child: identities.childId,
		epoch: identities.epoch,
		link: null,
		target: "thread-1",
		effect: "run",
	},
	spoken: { eligible: true, reason: "eligible" as const },
};

/**
 * A command execution approval.
 * @param overrides Fields that differ from a pending, voice-eligible request.
 * @returns The approval.
 */
const command = (overrides: Partial<CommandApproval> = {}): CommandApproval => ({
	...envelope,
	approvalKind: "command_execution",
	reason: "needs the network",
	command: "bun test",
	availableDecisions: [
		"accept",
		"acceptForSession",
		{
			applyNetworkPolicyAmendment: {
				network_policy_amendment: { host: "registry.npmjs.org", action: "allow" },
			},
		},
		"decline",
	],
	...overrides,
});

const NOT_PENDING = { eligible: false, reason: "not_pending" as const };

describe("approval cards", () => {
	test("a pending command offers the decisions the model defines, in its order", () => {
		const card = projectApproval(command(), false);
		expect(card.family).toBe("Command");
		expect(card.phase).toBe("pending");
		expect(card.decisions.map((option) => option.label)).toEqual([
			"Allow once",
			"Allow for session",
			"Allow network registry.npmjs.org",
			"Decline",
		]);
		expect(card.decisions[0]?.tone).toBe("default");
		expect(card.decisions[3]?.tone).toBe("destructive");
		expect(card.details.find((detail) => detail.label === "Command")).toEqual({
			label: "Command",
			value: "bun test",
			mono: true,
		});
		expect(card.spokenText).toBe("Can be answered by voice");
	});

	test("a busy decision hides the buttons and says so", () => {
		const card = projectApproval(command(), true);
		expect(card.phase).toBe("busy");
		expect(card.decisions).toEqual([]);
		expect(card.phaseText).toBe("Sending decision");
	});

	test("settlement, unknown outcome and expiry are terminal", () => {
		const settled = projectApproval(
			command({
				lifecycle: { state: "settled", decision: "approved", outcome: "delivered", reason: "ok" },
				spoken: NOT_PENDING,
			}),
			false,
		);
		expect(settled.phase).toBe("settled");
		expect(settled.phaseText).toBe("approved · delivered");
		const unknown = projectApproval(
			command({
				lifecycle: {
					state: "outcome_unknown",
					decision: "declined",
					outcome: "outcome_unknown",
					reason: "response lost",
				},
				spoken: NOT_PENDING,
			}),
			false,
		);
		expect(unknown.phase).toBe("outcome_unknown");
		expect(unknown.phaseText).toContain("response lost");
		const expired = projectApproval(
			command({
				lifecycle: { state: "expired", decision: "cancelled", outcome: null, reason: "deadline" },
				spoken: NOT_PENDING,
			}),
			false,
		);
		expect(expired.phase).toBe("closed");
		expect(expired.decisions).toEqual([]);
	});

	test("a question offers one button per option and none for secrets", () => {
		const question: QuestionApproval = {
			...envelope,
			approvalKind: "user_input",
			questions: [
				{
					id: "q1",
					header: "Branch",
					question: "Which branch?",
					isOther: false,
					isSecret: false,
					options: [
						{ label: "main", description: "" },
						{ label: "dev", description: "" },
					],
				},
				{
					id: "q2",
					header: "Token",
					question: "Paste the token",
					isOther: false,
					isSecret: true,
					options: null,
				},
			],
		};
		const card = projectApproval(question, false);
		expect(card.decisions.map((option) => option.choice)).toEqual([
			{ kind: "answer", questionId: "q1", answer: "main" },
			{ kind: "answer", questionId: "q1", answer: "dev" },
		]);
		expect(card.details.map((detail) => detail.label)).toContain("Token");
	});
});

describe("spoken approval line", () => {
	test("idle is silent; a lost resolver is a warning", () => {
		const idle: BrowserSpokenApproval = {
			kind: "spoken_approval",
			state: "idle",
			approval: null,
			gate: null,
			capturedUserFinal: null,
			settlement: null,
			reason: null,
		};
		expect(spokenApprovalLine(idle)).toBeNull();
		const lost: BrowserSpokenApproval = {
			...idle,
			state: "outcome_unknown",
			reason: "resolver_lost",
		};
		expect(spokenApprovalLine(lost)).toEqual({
			text: "Spoken approval: resolver lost, outcome unknown · resolver lost",
			warning: true,
		});
	});
});
