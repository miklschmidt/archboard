import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import {
	parseInternalCodeTargetUrl,
	type CodeTargetNotice,
	type CodeTargetOpenFailure,
	type CodeTargetOpenSuccess,
} from "../../shared/code-target";
import { openCodeTarget } from "../canvas/api";

type LinkHandler = NonNullable<ExcalidrawProps["onLinkOpen"]>;

export interface CodeTargetLinkHandlerOptions {
	boardKey: string | null;
	onSuccess: (reply: CodeTargetOpenSuccess) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

export interface CodeTargetActivationOptions {
	boardKey: string | null;
	elementId: string;
	onSuccess: (reply: CodeTargetOpenSuccess) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

function notice(reply: CodeTargetOpenFailure): CodeTargetNotice {
	return {
		kind: "error",
		message: reply.error,
		actions: reply.actions ?? [],
	};
}

function mismatch(message: string): CodeTargetNotice {
	return { kind: "error", message, actions: [] };
}

export function activateCodeTarget({
	boardKey,
	elementId,
	onSuccess,
	onFailure,
}: CodeTargetActivationOptions): void {
	if (!boardKey) {
		onFailure(mismatch("No board is available for this code target."));
		return;
	}
	void openCodeTarget({ board: boardKey, element: elementId }).then((reply) => {
		if (reply.success) onSuccess(reply);
		else onFailure(notice(reply));
		return reply;
	});
}

export function createCodeTargetLinkHandler({
	boardKey,
	onSuccess,
	onFailure,
}: CodeTargetLinkHandlerOptions): LinkHandler {
	return (element, event): void => {
		const request = element.link ? parseInternalCodeTargetUrl(element.link) : null;
		if (!request) return;

		event.preventDefault();
		if (request.board !== boardKey) {
			onFailure(mismatch("The link belongs to another board."));
			return;
		}
		if (request.element !== element.id) {
			onFailure(mismatch("The link belongs to another element."));
			return;
		}

		activateCodeTarget({
			boardKey: request.board,
			elementId: request.element,
			onSuccess,
			onFailure,
		});
	};
}
