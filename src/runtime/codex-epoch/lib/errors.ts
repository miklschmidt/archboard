import { CodexEpochError } from "./contract.js";
import type { CodexEpochErrorCode } from "./contract.js";
import { DurableStorageError } from "./storage.js";

function epochError(code: CodexEpochErrorCode, message: string, cause?: unknown): CodexEpochError {
	return new CodexEpochError(code, message, cause);
}

function mapStorageError(error: unknown, message: string): CodexEpochError {
	if (error instanceof CodexEpochError) {
		return error;
	}
	if (error instanceof DurableStorageError) {
		return epochError("durability_failed", `${message}: ${error.message}`, error);
	}
	return epochError("storage_failure", message, error);
}

function mapLockError(error: unknown): CodexEpochError {
	if (error instanceof Error && error.message === "epoch lock is already held") {
		return epochError("locked", "another epoch writer holds the durable lock", error);
	}
	return mapStorageError(error, "unable to acquire the epoch lock");
}

export { mapLockError, mapStorageError };
