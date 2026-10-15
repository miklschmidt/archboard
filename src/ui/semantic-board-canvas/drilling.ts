// Where a drill-down leads and the trail it leaves, as an entrypoint of the
// module. The stage follows drill-downs itself and needs none of this by name;
// it is here so that a drill across repositories can be held to from outside
// the module's private folders.

export { drillPlace, type RepositoryPlaces } from "@/ui/semantic-board-canvas/lib/drill-target";
export {
	NO_TRAIL,
	drillArrived,
	drillBack,
	drillInto,
	drillRefused,
	stopsOf,
	type DrillStop,
} from "@/ui/semantic-board-canvas/lib/drill-trail";
