---
id: TASK-524
title: Open the full diagram for the README history demonstration
status: Done
assignee:
  - '@codex'
created_date: 2026-10-24 14:34
updated_date: '2026-10-24T15:08:00Z'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The required README refresh stops before git-history can select Validate order. The scene opens the overview, which hides the nested Orders parts. The captured frame confirms that only the outer Orders module is visible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The git-history producer completes through real inspector and footprint results.
- [x] #2 The generated clip and thumbnail show the nested parts and their history.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board changes: this repairs the existing demonstration address. Add the existing viewA=Everything address only to the history scene. Keep the interface scenes on the overview. Regenerate git-history, inspect its frames and thumbnail, and run the complete normal gate with TASK-517.

The next real producer run reaches the inspector but exposes a second adapter mismatch: CLI responses carry vault metadata that the strict code-intel result schemas do not declare. Extend only the consumer response envelope with the known vault field. Keep validation of every analysis result field strict, then regenerate the affected demonstrations.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Opening Everything fixes the missing nested subject. The second run fails at LocalityReplySchema with unrecognized key vault. Footprint uses the same strict library schema against a CLI envelope and requires the same explicit envelope field.

The union footprint schema does not expose object extension. Replaced both response adaptations with one small input adapter that removes only the known CLI vault field. Both library decoders retain their original strict schemas and reject every other unknown field. Source TypeScript and scoped lint pass. A direct run of the actual adapter accepts the captured proposed CLI footprint and still rejects an unexpected extra field.

The final three-demonstration producer exits 0 in 103 seconds. git-history.webp is 1,662,366 bytes. Parent inspected history.png, footprint.png, and idx-git-history.webp: nested Orders parts, seven shared commits, and the branch proposal are visible. Full gate passes all 13 stages at 33aa81f0f.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The history scene opens Everything so its nested parts exist on screen. A small adapter removes CLI vault metadata before the unchanged strict result decoders. Real inspector and footprint assertions, generated frames, source types, lint, and the complete gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
