type Rect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

/** The shell's columns as the desktop viewport lays them out. */
type DesktopShell = {
	viewport: { width: number; height: number };
	/** The navigator's column: the brand bar, the navigator and the agent dock. */
	column: Rect;
	/** The pane centre: every pane and its header. */
	stages: Rect;
	pane: Rect;
	/** The agent dock at the navigator's foot. */
	dock: Rect;
	/** The composer, at the foot of the conversation while it is open. */
	composer: Rect | null;
	/** The conversation panel, while it is open. */
	panel: Rect | null;
};

type ThemeSnapshot = {
	inkContrast: number;
	/** The model the navigator marks as the one being read. */
	selectedRepository: string | null;
	focusedPaneCount: number;
	/** Visible connection warnings in the pane header; none while the socket is up. */
	connectionTrouble: number;
	/** Whether every font face the page declares loaded. */
	fontsLoaded: boolean;
	/** The font files the page fetched. */
	fontResources: string[];
};

/** The pane letters in the pane headers. */
type PaneLetters = {
	count: number;
	/** How many are drawn as the letter of the pane with focus. */
	active: number;
};

type NoticeLayout = {
	actionHeight: number;
	dismissHeight: number;
	text: string;
};

export { type DesktopShell, type ThemeSnapshot, type PaneLetters, type NoticeLayout };
