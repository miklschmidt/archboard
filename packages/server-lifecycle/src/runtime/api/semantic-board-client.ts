// How the CLI reads and writes a semantic board: through the running server, never the vault directly.
export {
	HistoricalCorrectionPreviewAnswerSchema,
	HistoricalCorrectionSuggestionsAnswerSchema,
	correctHistoricalBoardOnServer,
	suggestHistoricalCommitsOnServer,
	adoptSemanticBoardOnServer,
	branchSemanticBoardOnServer,
	checkSemanticVaultOnServer,
	createSemanticBoardOnServer,
	discardSemanticBoardOnServer,
	editSemanticBoardOnServer,
	listSemanticBoardsOnServer,
	moveSemanticBoardOnServer,
	readSemanticBoardAnswerOnServer,
	readSemanticBoardOnServer,
	ReconciliationReportSchema,
	renameSemanticBoardOnServer,
	renderSemanticBoardOnServer,
	resolveSemanticBoardOnServer,
	SemanticBoardEntrySchema,
	shelveSemanticBoardOnServer,
} from "#runtime/clients/semantic-board-client.ts";
export type {
	ReconciliationReport,
	SemanticWriteAnswer,
} from "#runtime/clients/semantic-board-client.ts";
