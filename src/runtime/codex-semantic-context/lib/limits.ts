const SEMANTIC_CONTEXT_LIMITS = Object.freeze({
	descriptionBytes: 8192,
	selectionEntries: 128,
	subjectIdBytes: 64,
	subjectNameBytes: 160,
	/** How many differences against the predecessor a brief names one by one. */
	differenceEntries: 64,
	/** How many unsettled disagreements a brief carries. */
	issueEntries: 32,
	/** The sentence saying what to do about one disagreement. */
	repairBytes: 512,
	ambiguityEntries: 16,
	ambiguityBytes: 256,
	doingBytes: 512,
	cursorBytes: 1024,
	feedIdJsonBytes: 3074,
	paneIdBytes: 128,
	reasonBytes: 512,
	repositoryBytes: 2048,
	boardKeyBytes: 2048,
	/** The path of the board document, which is a vault path and not a note. */
	fileBytes: 4096,
	identityBytes: 256,
	briefBytes: 8192,
});

const SEMANTIC_CONTEXT_ELLIPSIS = "…";

export { SEMANTIC_CONTEXT_ELLIPSIS, SEMANTIC_CONTEXT_LIMITS };
