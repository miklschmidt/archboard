// The icons of the site: Remix Icon, the icon library of the Archboard shell.

import add from "remixicon/icons/System/add-line.svg?raw";
import alert from "remixicon/icons/System/alert-line.svg?raw";
import arrowRight from "remixicon/icons/Arrows/arrow-right-line.svg?raw";
import arrowUpRight from "remixicon/icons/Arrows/arrow-right-up-line.svg?raw";
import back from "remixicon/icons/Arrows/arrow-go-back-line.svg?raw";
import branch from "remixicon/icons/Development/git-branch-line.svg?raw";
import check from "remixicon/icons/System/check-line.svg?raw";
import chevronLeft from "remixicon/icons/Arrows/arrow-left-s-line.svg?raw";
import chevronRight from "remixicon/icons/Arrows/arrow-right-s-line.svg?raw";
import code from "remixicon/icons/Development/code-s-slash-line.svg?raw";
import commit from "remixicon/icons/Development/git-commit-line.svg?raw";
import copy from "remixicon/icons/Document/file-copy-line.svg?raw";
import eye from "remixicon/icons/System/eye-line.svg?raw";
import fileCode from "remixicon/icons/Document/file-code-line.svg?raw";
import fileText from "remixicon/icons/Document/file-text-line.svg?raw";
import github from "remixicon/icons/Logos/github-fill.svg?raw";
import history from "remixicon/icons/System/history-line.svg?raw";
import image from "remixicon/icons/Media/image-line.svg?raw";
import lock from "remixicon/icons/System/lock-line.svg?raw";
import mic from "remixicon/icons/Media/mic-line.svg?raw";
import pause from "remixicon/icons/Media/pause-fill.svg?raw";
import play from "remixicon/icons/Media/play-fill.svg?raw";
import question from "remixicon/icons/Communication/question-answer-line.svg?raw";
import route from "remixicon/icons/Map/route-line.svg?raw";
import search from "remixicon/icons/System/search-line.svg?raw";
import stack from "remixicon/icons/Business/stack-line.svg?raw";
import subtract from "remixicon/icons/System/subtract-line.svg?raw";
import terminal from "remixicon/icons/Development/terminal-box-line.svg?raw";
import unlock from "remixicon/icons/System/lock-unlock-line.svg?raw";
import box from "remixicon/icons/Others/box-3-line.svg?raw";
import codeLine from "remixicon/icons/Development/code-line.svg?raw";
import database from "remixicon/icons/Device/database-2-line.svg?raw";
import external from "remixicon/icons/System/external-link-line.svg?raw";
import flashlight from "remixicon/icons/Weather/flashlight-line.svg?raw";
import server from "remixicon/icons/Device/server-line.svg?raw";
import store from "remixicon/icons/Buildings/store-2-line.svg?raw";
import timer from "remixicon/icons/System/timer-line.svg?raw";
import voice from "remixicon/icons/Media/voiceprint-line.svg?raw";

export const icons = {
	add,
	alert,
	arrowRight,
	arrowUpRight,
	back,
	branch,
	check,
	chevronLeft,
	chevronRight,
	code,
	commit,
	copy,
	eye,
	fileCode,
	fileText,
	github,
	history,
	image,
	lock,
	mic,
	pause,
	play,
	question,
	route,
	search,
	stack,
	subtract,
	terminal,
	unlock,
	voice,
	box,
	codeLine,
	database,
	external,
	flashlight,
	server,
	store,
	timer,
};

export type IconName = keyof typeof icons;

/** The icon and colour the renderer draws each module kind with (data-type-icon in its SVGs). */
export const kinds = {
	ui: { icon: "store", color: "pink", name: "User interface" },
	service: { icon: "server", color: "blue", name: "Service" },
	datastore: { icon: "database", color: "emerald", name: "Data store" },
	external: { icon: "external", color: "neutral", name: "External" },
	cache: { icon: "flashlight", color: "yellow", name: "Cache" },
	module: { icon: "box", color: "teal", name: "Module" },
	function: { icon: "codeLine", color: "cyan", name: "Function" },
	route: { icon: "route", color: "violet", name: "Route" },
	queue: { icon: "stack", color: "orange", name: "Queue" },
	job: { icon: "timer", color: "amber", name: "Job" },
} as const satisfies Record<string, { icon: IconName; color: string; name: string }>;

export type Kind = keyof typeof kinds;
