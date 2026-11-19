// The icon of each section of the reader's side columns, in one place, so a section reads alike in
// the left column and in the right panel, and an owner row of the change list wears the icon of
// the section that lists its kind.

import {
	RiArrowLeftDownLine,
	RiArrowRightUpLine,
	RiBox3Line,
	RiExpandDiagonalLine,
	RiFileCodeLine,
	RiGitCommitLine,
	RiGitPullRequestLine,
	RiHistoryLine,
	RiLinksLine,
	RiLockLine,
	RiPlayCircleLine,
	RiPlugLine,
	RiPriceTag3Line,
	RiRouteLine,
	RiShapesLine,
	RiShareLine,
	RiStackLine,
	RiSwapLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type { OwnerKind } from "#ui/architecture-drawing/model-reader/rules/change-list.ts";

/** The icon of each section. */
const SECTION_ICONS = {
	changes: RiGitPullRequestLine,
	interfaceChanges: RiPlugLine,
	modules: RiBox3Line,
	collections: RiStackLine,
	flows: RiRouteLine,
	walkthroughs: RiPlayCircleLine,
	against: RiSwapLine,
	interface: RiPlugLine,
	implementation: RiLockLine,
	expanded: RiExpandDiagonalLine,
	sendsTo: RiArrowRightUpLine,
	receivesFrom: RiArrowLeftDownLine,
	changesWith: RiGitCommitLine,
	codeEvidence: RiFileCodeLine,
	codeHistory: RiHistoryLine,
	relationships: RiShareLine,
	ends: RiLinksLine,
	legend: RiShapesLine,
	groups: RiPriceTag3Line,
} as const satisfies Readonly<Record<string, RemixiconComponentType>>;

/** The icon of each owner of the change list, which is the icon of the section of its kind. */
const OWNER_ICONS = {
	module: SECTION_ICONS.modules,
	collection: SECTION_ICONS.collections,
	flow: SECTION_ICONS.flows,
	walkthrough: SECTION_ICONS.walkthroughs,
} as const satisfies Readonly<Record<OwnerKind, RemixiconComponentType>>;

export { OWNER_ICONS, SECTION_ICONS };
