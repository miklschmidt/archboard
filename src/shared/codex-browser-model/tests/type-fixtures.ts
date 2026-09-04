import type { BrowserDto, BrowserDynamicApprovalResponse, DynamicApprovalState } from "../index.js";

type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;

export function exhaustiveBrowserDto(dto: BrowserDto): string {
	switch (dto.kind) {
		case "snapshot":
		case "readiness":
		case "account":
		case "login":
		case "thread_link":
		case "thread_candidates":
		case "timeline":
		case "queue":
		case "settings":
		case "approval":
		case "text_command":
		case "semantic_delivery":
		case "coordinator":
		case "voice":
		case "command_lease":
		case "operation_outcome":
		case "dynamic_approval":
			return dto.kind;
		default: {
			const neverDto: never = dto;
			return neverDto;
		}
	}
}

export function exhaustiveDynamicApprovalState(state: DynamicApprovalState): string {
	switch (state) {
		case "pending":
		case "approved":
		case "declined":
		case "expired":
		case "cancelled":
		case "disconnected":
		case "stale":
		case "delivered":
		case "not_delivered":
		case "outcome_unknown":
			return state;
		default: {
			const neverState: never = state;
			return neverState;
		}
	}
}

export function dynamicApprovalResponseDecision(
	response: BrowserDynamicApprovalResponse,
): "approve" | "decline" {
	return response.decision;
}

type _DynamicApprovalStatesAreClosed = Assert<
	Equal<
		DynamicApprovalState,
		| "pending"
		| "approved"
		| "declined"
		| "expired"
		| "cancelled"
		| "disconnected"
		| "stale"
		| "delivered"
		| "not_delivered"
		| "outcome_unknown"
	>
>;

type _BrowserDtoIsClosed = Assert<
	Equal<
		BrowserDto["kind"],
		| "snapshot"
		| "readiness"
		| "account"
		| "login"
		| "thread_link"
		| "thread_candidates"
		| "timeline"
		| "queue"
		| "settings"
		| "approval"
		| "text_command"
		| "semantic_delivery"
		| "coordinator"
		| "voice"
		| "command_lease"
		| "operation_outcome"
		| "dynamic_approval"
	>
>;
