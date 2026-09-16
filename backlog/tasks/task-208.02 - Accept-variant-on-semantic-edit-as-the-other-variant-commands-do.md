---
id: TASK-208.02
title: Accept --variant on semantic edit as the other variant commands do
status: To Do
assignee: []
created_date: '2026-09-16 02:26'
labels: []
dependencies: []
parent_task_id: TASK-208
ordinal: 421000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-16 skill evaluation batch five to six author runs per arm first ran `semantic edit <board> --variant <name>` and got exit 2, then retried with `variant` inside the payload. inspect, render, rasterize and adopt all accept `--variant`; edit alone takes it only in the JSON. Every variant edit pays a wasted call, and the refusal does not say where the variant goes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard semantic edit <board> --variant <name>` targets that variant, and a payload naming a different variant is refused with both names
- [ ] #2 The generated help lists the option and the skill edit recipe shows it
<!-- AC:END -->
