import type {
	ApprovalFamily,
	ApprovalRequest,
	ApprovalResponse,
} from "@/runtime/codex-approvals/lib/contract";

/** Each response variant keyed by the approval family it answers. */
type ApprovalResponseByKind = {
	readonly [Kind in ApprovalFamily]: Extract<ApprovalResponse, { readonly approvalKind: Kind }>;
};

/** Each request variant keyed by its approval family. */
type ApprovalRequestByFamily = {
	readonly [Family in ApprovalFamily]: Extract<ApprovalRequest, { readonly family: Family }>;
};

/** One handler per approval family, each typed to its own response variant. */
type ApprovalResponseHandlers<Result> = {
	readonly [Kind in ApprovalFamily]: (response: ApprovalResponseByKind[Kind]) => Result;
};

/** One handler per approval family, each typed to its own request variant. */
type ApprovalRequestHandlers<Result> = {
	readonly [Family in ApprovalFamily]: (request: ApprovalRequestByFamily[Family]) => Result;
};

/**
 * Routes a response to the handler for its family. The family is passed
 * separately from the response so the compiler can correlate the two through
 * the mapped handler type instead of a type assertion.
 * @param handlers - The handler for every family.
 * @param kind - The response's approval kind.
 * @param response - The response itself.
 * @returns Whatever the family's handler returns.
 */
function handleApprovalResponse<Result, Kind extends ApprovalFamily>(
	handlers: ApprovalResponseHandlers<Result>,
	kind: Kind,
	response: ApprovalResponseByKind[Kind],
): Result {
	return handlers[kind](response);
}

/**
 * Routes a request to the handler for its family, correlated the same way as
 * {@link handleApprovalResponse}.
 * @param handlers - The handler for every family.
 * @param family - The request's family.
 * @param request - The request itself.
 * @returns Whatever the family's handler returns.
 */
function handleApprovalRequest<Result, Family extends ApprovalFamily>(
	handlers: ApprovalRequestHandlers<Result>,
	family: Family,
	request: ApprovalRequestByFamily[Family],
): Result {
	return handlers[family](request);
}

export {
	type ApprovalRequestByFamily,
	type ApprovalRequestHandlers,
	type ApprovalResponseByKind,
	type ApprovalResponseHandlers,
	handleApprovalRequest,
	handleApprovalResponse,
};
