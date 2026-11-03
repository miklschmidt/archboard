import type { ApprovalFamily, ApprovalResponse } from "#runtime/services/approvals/contract.ts";

/** Each response variant keyed by the approval family it answers. */
type ApprovalResponseByKind = {
	readonly [Kind in ApprovalFamily]: Extract<ApprovalResponse, { readonly approvalKind: Kind }>;
};

/** One handler per approval family, each typed to its own response variant. */
type ApprovalResponseHandlers<Result> = {
	readonly [Kind in ApprovalFamily]: (response: ApprovalResponseByKind[Kind]) => Result;
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

export { type ApprovalResponseByKind, type ApprovalResponseHandlers, handleApprovalResponse };
