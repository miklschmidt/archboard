// What the picture says about a part of it the pointer rests on, as an
// entrypoint of the module. The stage draws its tips itself and needs none of
// this by name; it is here so that what a tip says, and which parts have one,
// can be held to from outside the module's private folders.

export {
	openableAt,
	subjectTip,
	tipAnchor,
	tipTargetAt,
} from "@/ui/semantic-board-canvas/lib/subject-tips";
