import type { ApprovalFamily, BrowserApprovalResponse, TerminalApprovalState } from "../index.js";
import type { IdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import type {
	ReverseResponse,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import {
	applyPatchRequest,
	commandRequestWithAvailableDecisions,
	elicitationRequest,
	execCommandRequest,
	fileRequest,
	permissionsRequest,
	userInputRequest,
} from "./support.js";

export interface FamilyResponseCase {
	readonly name: string;
	readonly response: (label: string) => BrowserApprovalResponse;
	readonly expected: (label: string) => ReverseResponse;
}

export interface ApprovalFamilyCase {
	readonly name: string;
	readonly family: ApprovalFamily;
	readonly make: (identity: IdentityAuthority, label: string) => TransportServerRequest;
	readonly responses: readonly FamilyResponseCase[];
	readonly negative: (label: string) => BrowserApprovalResponse;
	readonly fallback: (state: TerminalApprovalState) => ReverseResponse;
}

function commandRequest(identity: IdentityAuthority, label: string): TransportServerRequest {
	return commandRequestWithAvailableDecisions(identity, label, ["accept", "decline", "cancel"]);
}

function invalid(value: unknown): BrowserApprovalResponse {
	return value as BrowserApprovalResponse;
}

export const approvalFamilyCases: readonly ApprovalFamilyCase[] = [
	{
		name: "command",
		family: "command_execution",
		make: commandRequest,
		responses: [
			{
				name: "accept",
				response: () => ({ approvalKind: "command_execution", decision: "accept" }),
				expected: () => ({ result: { decision: "accept" } }),
			},
			{
				name: "decline",
				response: () => ({ approvalKind: "command_execution", decision: "decline" }),
				expected: () => ({ result: { decision: "decline" } }),
			},
			{
				name: "cancel",
				response: () => ({ approvalKind: "command_execution", decision: "cancel" }),
				expected: () => ({ result: { decision: "cancel" } }),
			},
		],
		negative: () => ({ approvalKind: "command_execution", decision: "acceptForSession" }),
		fallback: () => ({ result: { decision: "cancel" } }),
	},
	{
		name: "file",
		family: "file_change",
		make: fileRequest,
		responses: [
			{
				name: "accept",
				response: () => ({ approvalKind: "file_change", decision: "accept" }),
				expected: () => ({ result: { decision: "accept" } }),
			},
			{
				name: "accept for session",
				response: () => ({ approvalKind: "file_change", decision: "acceptForSession" }),
				expected: () => ({ result: { decision: "acceptForSession" } }),
			},
			{
				name: "decline",
				response: () => ({ approvalKind: "file_change", decision: "decline" }),
				expected: () => ({ result: { decision: "decline" } }),
			},
			{
				name: "cancel",
				response: () => ({ approvalKind: "file_change", decision: "cancel" }),
				expected: () => ({ result: { decision: "cancel" } }),
			},
		],
		negative: () => invalid({ approvalKind: "file_change", decision: "invalid" }),
		fallback: () => ({ result: { decision: "cancel" } }),
	},
	{
		name: "user input",
		family: "user_input",
		make: userInputRequest,
		responses: [
			{
				name: "answer",
				response: (label) => ({
					approvalKind: "user_input",
					answers: { [`${label}-0`]: { answers: ["yes"] } },
				}),
				expected: (label) => ({
					result: { answers: { [`${label}-0`]: { answers: ["yes"] } } },
				}),
			},
		],
		negative: () => invalid({ approvalKind: "user_input", answers: {}, decision: "decline" }),
		fallback: () => ({ result: { answers: {} } }),
	},
	{
		name: "elicitation",
		family: "elicitation",
		make: elicitationRequest,
		responses: [
			{
				name: "accept",
				response: () => ({
					approvalKind: "elicitation",
					action: "accept",
					content: { ok: true },
					_meta: null,
				}),
				expected: () => ({ result: { action: "accept", content: { ok: true }, _meta: null } }),
			},
			{
				name: "decline",
				response: () => ({
					approvalKind: "elicitation",
					action: "decline",
					content: null,
					_meta: null,
				}),
				expected: () => ({ result: { action: "decline", content: null, _meta: null } }),
			},
			{
				name: "cancel",
				response: () => ({
					approvalKind: "elicitation",
					action: "cancel",
					content: null,
					_meta: null,
				}),
				expected: () => ({ result: { action: "cancel", content: null, _meta: null } }),
			},
		],
		negative: () =>
			invalid({ approvalKind: "elicitation", action: "approve", content: null, _meta: null }),
		fallback: () => ({ result: { action: "cancel", content: null, _meta: null } }),
	},
	{
		name: "permissions",
		family: "permissions",
		make: permissionsRequest,
		responses: [
			{
				name: "turn",
				response: () => ({ approvalKind: "permissions", permissions: {}, scope: "turn" }),
				expected: () => ({ result: { permissions: {}, scope: "turn" } }),
			},
			{
				name: "session",
				response: () => ({ approvalKind: "permissions", permissions: {}, scope: "session" }),
				expected: () => ({ result: { permissions: {}, scope: "session" } }),
			},
		],
		negative: () =>
			invalid({ approvalKind: "permissions", permissions: {}, scope: "turn", decision: "decline" }),
		fallback: () => ({ result: { permissions: {}, scope: "turn" } }),
	},
	{
		name: "apply patch",
		family: "apply_patch",
		make: applyPatchRequest,
		responses: [
			{
				name: "approved",
				response: () => ({ approvalKind: "apply_patch", decision: "approved" }),
				expected: () => ({ result: { decision: "approved" } }),
			},
			{
				name: "approved for session",
				response: () => ({ approvalKind: "apply_patch", decision: "approved_for_session" }),
				expected: () => ({ result: { decision: "approved_for_session" } }),
			},
			{
				name: "denied",
				response: () => ({
					approvalKind: "apply_patch",
					decision: { denied: { rejection: "no" } },
				}),
				expected: () => ({ result: { decision: { denied: { rejection: "no" } } } }),
			},
			{
				name: "abort",
				response: () => ({ approvalKind: "apply_patch", decision: "abort" }),
				expected: () => ({ result: { decision: "abort" } }),
			},
		],
		negative: () => invalid({ approvalKind: "apply_patch", decision: "decline" }),
		fallback: (state) => ({ result: { decision: state === "expired" ? "timed_out" : "abort" } }),
	},
	{
		name: "exec command",
		family: "exec_command",
		make: execCommandRequest,
		responses: [
			{
				name: "approved",
				response: () => ({ approvalKind: "exec_command", decision: "approved" }),
				expected: () => ({ result: { decision: "approved" } }),
			},
			{
				name: "approved for session",
				response: () => ({ approvalKind: "exec_command", decision: "approved_for_session" }),
				expected: () => ({ result: { decision: "approved_for_session" } }),
			},
			{
				name: "denied",
				response: () => ({
					approvalKind: "exec_command",
					decision: { denied: { rejection: "no" } },
				}),
				expected: () => ({ result: { decision: { denied: { rejection: "no" } } } }),
			},
			{
				name: "abort",
				response: () => ({ approvalKind: "exec_command", decision: "abort" }),
				expected: () => ({ result: { decision: "abort" } }),
			},
		],
		negative: () => invalid({ approvalKind: "exec_command", decision: "decline" }),
		fallback: (state) => ({ result: { decision: state === "expired" ? "timed_out" : "abort" } }),
	},
];
