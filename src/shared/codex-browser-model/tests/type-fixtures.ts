import type { BrowserDto, ServerRequest, ServerRequestMethod } from "../index.js";

type Assert<T extends true> = T;
type Equal<A, B> = [A, B] extends [B, A] ? true : false;

export function exhaustiveBrowserDto(dto: BrowserDto): string {
	switch (dto.kind) {
		case "snapshot":
		case "readiness":
		case "account":
		case "login":
		case "thread_link":
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
		case "browser_command":
			return dto.kind;
		default: {
			const neverDto: never = dto;
			return neverDto;
		}
	}
}

export function exhaustiveServerRequest(request: ServerRequest): ServerRequestMethod {
	switch (request.method) {
		case "item/commandExecution/requestApproval":
		case "item/fileChange/requestApproval":
		case "item/tool/requestUserInput":
		case "mcpServer/elicitation/request":
		case "item/permissions/requestApproval":
		case "item/tool/call":
		case "account/chatgptAuthTokens/refresh":
		case "attestation/generate":
		case "currentTime/read":
		case "applyPatchApproval":
		case "execCommandApproval":
			return request.method;
		default: {
			const neverRequest: never = request;
			return neverRequest;
		}
	}
}

type _BrowserDtoIsClosed = Assert<
	Equal<
		BrowserDto["kind"],
		| "snapshot"
		| "readiness"
		| "account"
		| "login"
		| "thread_link"
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
		| "browser_command"
	>
>;

type _ServerRequestMethodsAreClosed = Assert<Equal<ServerRequest["method"], ServerRequestMethod>>;
