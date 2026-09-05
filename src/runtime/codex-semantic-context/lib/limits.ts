const SEMANTIC_CONTEXT_LIMITS = Object.freeze({
	descriptionBytes: 8192,
	selectionEntries: 128,
	selectionIdBytes: 64,
	ambiguityEntries: 16,
	ambiguityBytes: 256,
	doingBytes: 512,
	cursorBytes: 1024,
	feedIdJsonBytes: 3074,
	paneIdBytes: 128,
	reasonBytes: 512,
	repositoryBytes: 2048,
	boardKeyBytes: 2048,
	noteBytes: 4096,
	identityBytes: 256,
	briefBytes: 8192,
});

const SEMANTIC_CONTEXT_ELLIPSIS = "…";

export { SEMANTIC_CONTEXT_ELLIPSIS, SEMANTIC_CONTEXT_LIMITS };
