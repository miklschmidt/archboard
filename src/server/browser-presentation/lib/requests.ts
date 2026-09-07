import type { Request } from "express";
import { z } from "zod";
import type {
	CaptureResult,
	PendingBrowserCapture,
} from "@/server/browser-presentation/lib/pending-work";

const viewportRequestBodySchema = z.object({
	scrollToContent: z.boolean().optional(),
	scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
	viewportZoomFactor: z.number().positive().max(1).optional(),
	scrollToElementId: z.string().min(1).optional(),
	zoom: z.number().min(0.1).max(10).optional(),
	offsetX: z.number().optional(),
	offsetY: z.number().optional(),
	pane: z.string().min(1).optional(),
});
type ViewportRequestBody = Readonly<
	Omit<z.output<typeof viewportRequestBodySchema>, "scrollToElementIds"> & {
		readonly scrollToElementIds?: readonly string[] | undefined;
	}
>;

/**
 * Counts how many of the mutually exclusive viewport modes a request names.
 * @param params The parsed viewport request.
 * @returns The number of modes present; a valid request names exactly one.
 */
function viewportModeCount(params: ViewportRequestBody): number {
	const manual =
		params.zoom !== undefined || params.offsetX !== undefined || params.offsetY !== undefined;
	return [
		params.scrollToContent === true,
		params.scrollToElementIds !== undefined,
		params.scrollToElementId !== undefined,
		manual,
	].filter(Boolean).length;
}

/**
 * Tells whether a zoom factor was given with a mode that cannot use it.
 * @param params The parsed viewport request.
 * @returns True when viewportZoomFactor accompanies neither scrollToContent nor scrollToElementIds.
 */
function viewportZoomFactorMisplaced(params: ViewportRequestBody): boolean {
	return (
		params.viewportZoomFactor !== undefined &&
		params.scrollToContent !== true &&
		params.scrollToElementIds === undefined
	);
}

const viewportRequestSchema = viewportRequestBodySchema.superRefine(
	/**
	 * Refuses a request that names no mode, several modes, or a misplaced zoom factor.
	 * @param params The parsed viewport request.
	 * @param context The refinement context issues are added to.
	 */
	(params: ViewportRequestBody, context: Readonly<Pick<z.RefinementCtx, "addIssue">>) => {
		if (viewportModeCount(params) !== 1) {
			context.addIssue({
				code: "custom",
				message:
					"Specify exactly one viewport mode: scrollToContent, scrollToElementIds, scrollToElementId, or manual zoom/offset",
			});
		}
		if (viewportZoomFactorMisplaced(params)) {
			context.addIssue({
				code: "custom",
				path: ["viewportZoomFactor"],
				message: "viewportZoomFactor requires scrollToContent or scrollToElementIds",
			});
		}
	},
);

const captureRequestSchema = z.object({
	format: z.unknown().optional(),
	background: z.unknown().optional(),
	pane: z.unknown().optional(),
});
const captureResultSchema = z.object({
	requestId: z.unknown().optional(),
	format: z.unknown().optional(),
	data: z.unknown().optional(),
	error: z.unknown().optional(),
});
const viewportResultSchema = z.object({
	requestId: z.unknown().optional(),
	success: z.unknown().optional(),
	message: z.unknown().optional(),
	error: z.unknown().optional(),
});
type CaptureResultReport = z.output<typeof captureResultSchema>;

type BrowserRequest = Readonly<Pick<Request<Record<string, string>, unknown, unknown>, "body">>;

/**
 * Renders a thrown value as the message a route answers with.
 * @param error The thrown value.
 * @returns The error's message, the string itself, or a generic message.
 */
function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return typeof error === "string" ? error : "Unknown browser presentation error";
}

/**
 * Joins schema issues into one message.
 * @param issues The zod issues.
 * @returns The messages separated by semicolons.
 */
function validationMessages(
	issues: readonly Readonly<Pick<z.ZodError["issues"][number], "message">>[],
): string {
	return issues.map((issue) => issue.message).join("; ");
}

/**
 * Picks the message for a failed viewport move out of what the pane reported.
 * @param error The pane's error field.
 * @param message The pane's message field.
 * @returns The first non-empty string, or the generic failure message.
 */
function viewportFailureMessage(error: unknown, message: unknown): string {
	if (typeof error === "string" && error.length > 0) {
		return error;
	}
	return typeof message === "string" && message.length > 0 ? message : "Viewport update failed";
}

/**
 * Picks the message for a successful viewport move.
 * @param message The pane's message field.
 * @returns The pane's message when it sent one, else the generic success message.
 */
function viewportSuccessMessage(message: unknown): string {
	return typeof message === "string" && message.length > 0 ? message : "Viewport updated";
}

/**
 * Reads the request id a pane's result names.
 * @param requestId The reported request id.
 * @returns The id, or null when it is missing or empty.
 */
function reportedRequestId(requestId: unknown): string | null {
	return typeof requestId === "string" && requestId.length > 0 ? requestId : null;
}

/**
 * Reads the capture format a request asks for.
 * @param format The reported format.
 * @returns The format, or null when it is not png or svg.
 */
function captureFormat(format: unknown): "png" | "svg" | null {
	return format === "png" || format === "svg" ? format : null;
}

/**
 * Parses a capture request body, treating an absent body as empty.
 * @param body The request body.
 * @returns The parsed fields.
 */
function parseCaptureRequest(body: unknown): z.output<typeof captureRequestSchema> {
	return captureRequestSchema.parse(body ?? {});
}

/**
 * Reads the format and data of a pane's successful capture report.
 * @param report The parsed result body.
 * @returns The capture result.
 */
function successfulCapture(report: CaptureResultReport): CaptureResult {
	if (typeof report.format !== "string" || typeof report.data !== "string") {
		throw new TypeError("format and data are required for a successful browser capture result");
	}
	return { format: report.format, data: report.data };
}

/**
 * Keeps the largest capture answered so far: the most complete canvas when several panes answer.
 * @param pending The capture being collected.
 * @param result A pane's capture.
 */
function keepLargestCapture(pending: PendingBrowserCapture, result: CaptureResult): void {
	if (pending.bestResult === null || result.data.length > pending.bestResult.data.length) {
		pending.bestResult = result;
	}
}

/**
 * Clears the dispatch and collection timers of a capture, leaving its expiry timer alone.
 * @param pending The capture whose timers are cleared.
 */
function clearCaptureFollowUps(pending: PendingBrowserCapture): void {
	if (pending.dispatchTimeout !== null) {
		clearTimeout(pending.dispatchTimeout);
	}
	if (pending.collectionTimeout !== null) {
		clearTimeout(pending.collectionTimeout);
	}
}

export {
	captureFormat,
	captureRequestSchema,
	captureResultSchema,
	clearCaptureFollowUps,
	errorMessage,
	keepLargestCapture,
	parseCaptureRequest,
	reportedRequestId,
	successfulCapture,
	validationMessages,
	viewportFailureMessage,
	viewportRequestSchema,
	viewportResultSchema,
	viewportSuccessMessage,
};
export type { BrowserRequest, CaptureResultReport };
