import { z } from "zod";
import { BoardRequiredError, BoardResolutionError } from "../../../runtime/engine/board-target.js";
import { BoardMutationError } from "../../../runtime/engine/board-write.js";
import { BoardHeldError } from "../../../runtime/engine/board-lock.js";
import { BoardWriteConflictError } from "../../../runtime/engine/board-io.js";
import { RenderGeometryError } from "../../../runtime/engine/geometry.js";
import { NativeElementValidationError } from "../../../runtime/engine/native-element.js";
import { BoardRendererError } from "../../board-rendering/index.js";

function errorMessage(error: unknown): unknown {
	if (error === null || error === undefined) {
		throw new TypeError("A board error must be a non-nullish value");
	}
	return Reflect.get(new Object(error), "message");
}

function boardErrorStatus(error: unknown): number {
	if (error instanceof z.ZodError) {
		return 400;
	}
	if (error instanceof BoardRequiredError) {
		return error.status;
	}
	if (error instanceof BoardResolutionError) {
		return error.status;
	}
	if (error instanceof BoardMutationError) {
		return error.status;
	}
	if (error instanceof BoardRendererError) {
		return 503;
	}
	if (error instanceof RenderGeometryError) {
		return 400;
	}
	if (error instanceof NativeElementValidationError) {
		return 400;
	}
	if (error instanceof BoardWriteConflictError || error instanceof BoardHeldError) {
		return 409;
	}
	return /is not open|Invalid board name|Invalid variant|Invalid level|No vault configured|outside the vault|No pane called|matches \d+ panes|No pane is open|needs a pane/u.test(
		String(errorMessage(error)),
	)
		? 400
		: 500;
}

function boardErrorBody(error: unknown): Record<string, unknown> {
	let message: unknown;
	if (error instanceof z.ZodError) {
		const messages: string[] = [];
		for (const issue of error.issues) {
			messages.push(issue.message);
		}
		message = messages.join("; ");
	} else {
		message = errorMessage(error);
	}
	const base = {
		success: false,
		error: message,
	};
	if (error instanceof BoardRequiredError) {
		return { ...base, code: error.code, available: error.available };
	}
	if (error instanceof BoardResolutionError) {
		return {
			...base,
			code: error.code,
			board: error.board,
			reason: error.reason,
			...(error.files.length > 0 ? { files: error.files } : {}),
		};
	}
	if (error instanceof BoardWriteConflictError) {
		return { ...base, conflict: error.conflict };
	}
	if (error instanceof BoardHeldError) {
		return {
			...base,
			code: error.code,
			board: error.board,
			holder: error.holder,
			waitedMs: error.waitedMs,
		};
	}
	if (error instanceof BoardRendererError) {
		return { ...base, code: error.code };
	}
	if (
		error instanceof BoardMutationError &&
		typeof error.code === "string" &&
		error.code.length > 0
	) {
		return { ...base, code: error.code };
	}
	return base;
}

export { boardErrorBody, boardErrorStatus };
