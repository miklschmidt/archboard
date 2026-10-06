---
status: accepted
---

# The picture answers the hand, and a card opens by flight

The amendment of 2026-10-06 at the end replaces one sentence of answer 1 and
one sentence of answer 2. [ADR 0044](0044-cards-containers-and-groups-are-drawn-as-slabs.md)
records the change to the picture's surfaces that came from the same request.
The second amendment of 2026-10-06 takes the ease away from a pinch, says when
the camera is at rest, and replaces the sentence of "How the picture is marked"
about the board inside a card. The third makes the swap between the near and
the far view a shared element transition.

A reader who does not know a system learns it by poking at its picture. A still
drawing leaves the work to the reader. They must find what a part is wired to,
follow a line with the eye, and find their place again when a board changes.
TASK-386 made the picture answer the reader's hand. It did this on 2026-10-03.

The browser still writes nothing. Every answer below is presentation state, in
the same class as the camera and the selection (ADR 0023). It is never sent to
the server and never part of an address.

## Decision

The picture gives five answers. Each has one owner in `src/ui/semantic-board-canvas`.

1. **The camera moves under a hand.** A turn of the wheel or a pinch zooms by an
   amount in proportion to the turn. The camera eases toward where the hand sent
   it (`EXPLORING_MS.cameraEase`), so a hard flick adds up and eases once. The arrow
   keys ease in the same way. A released drag carries on at its release speed and
   slows to rest (`cameraFling`). The `0` key glides to the whole board. A press
   stops all of it where it is drawn. The frame loop runs only while something
   moves.
2. **The picture answers a poke.** The part that is picked out, or that the
   pointer rests on, lights what it is wired to (the Light in `CONTEXT.md`). The
   rest recedes. The relationships that light are drawn on once, from source to
   target. Seen from far, relationship labels go, because the cards already draw
   their names alone. A lit or picked label stays.
3. **The list and the picture answer each other.** A row of the relationship list
   lights its relationship while the pointer or the focus is on the row. A pick
   that somebody other than the reader made, from the list or by a command,
   brings the part into view once (`reveal`). A trace (`CONTEXT.md`) lights what
   a part reaches onward or back, each hop more faintly and one hop after
   another (`reachHop`).
4. **A card opens its board by flight (the Dive).** The board's picture is put
   inside the card, in the picture's own units, as large as the card allows with
   its shape kept. The camera glides into the card (`dive`). The flight ends with
   the picture inside the card exactly where the board stands once it is opened
   and fitted. Then the pane does what it has always done to open the board, and
   the board's picture takes over from the one inside the card in the same
   commit, with no entrance. Going back runs the flight the other way, from the
   card that opened the board.
5. **Anything that would make the flight worse is the plain way.** The plain way
   is the only way to open a board, and the flight ends in it. It is used when the
   reader asked for no motion, when a walkthrough is presented, when the card is
   not drawn, when the board's picture is not to hand within `divePrefetch`, and
   when the picture changes under the flight. A second request ends the first at
   once and is made the plain way. A press, a turn of the wheel or a key (Tab and
   the modifier keys excepted) ends a flight at its end and goes no further.

## How the picture is marked

The viewer marks the picture's own groups with classes (`is-lit`, `is-reach-2`
and so on). The surface carries the strength (`is-probing`, `is-far`). Rules in
`app.css` turn the marks into an opacity filter. The picture's own markup and
style sheet do not change, so an export is the same bytes as before. The
drawn-on lines are copies in a layer that the viewer adds and removes.

Where routes of one kind lie on one line, the renderer has one of them draw each
shared stretch and cuts it from the others with a mask, so a trunk reads as one
line. The light is by relationship, so a lit route would be lit only up to the
junction where it joins the trunk, and pale along it. The viewer points a lit
route at a copy of its mask without those cutouts (`lib/lit-ink.ts`, TASK-387).
The gaps under a line that crosses over stay, and so does the picture's own rule
for a picked route. The renderer's output does not change. It tells the two
kinds of cutout apart by their caps, butt for a trunk and round for a crossing,
and a test of the renderer holds it to that.

The surface's classes reach every descendant, so they would reach the board
inside a card too. One rule in `app.css` gives that board no filter. The board
inside a card also carries `is-far` when it will be seen from far where the
flight meets it, so it draws the same cards as the board that opens.

## Why

- **Presentation, so nothing is written.** All five answers are the reader's
  attention. An agent's board is unchanged by them. A viewer that wrote anything
  would break ADR 0023.
- **A filter, not a layer.** A recede painted as a layer over the picture would
  repaint the picture on every move, and the Still Shadow Rule in `DESIGN.md`
  forbids it. A filter on the groups multiplies with the opacity that the
  picture's own style sheet and a picture flight write.
- **One camera.** The board sits inside the card in the parent's units, so the one
  camera carries both pictures. Nothing has to be matched by eye. The flight ends
  where the board stands because the arithmetic puts it there, and the browser
  owner holds it to two pixels.
- **Every duration is in one file.** They live in `src/shared/timing/lib/exploring.ts`
  with what each pulls against, and everything that moves runs on the frame clock
  (ADR 0041), so a recording renders it frame by frame.

## Considered and not chosen

- A dim layer, blur or halo over the picture for the light. It breaks the Still
  Shadow Rule and slows a drag.
- Hover and light rules in the picture's style sheet. It would change every
  export for a state that only the viewer has.
- A second layer, with its own camera, for the board in the card. It must be kept
  in step with the first, and the two can disagree by a pixel at the hand-over.
- A cross-fade between two whole pictures with no shared geometry. It hides the
  fact that the board in the card and the board that opens are the same board.

## Consequences

- A card with a drill-down opens its board about 0.7 s after the reader asks, when
  the board's picture is to hand. Pictures are drawn ahead, so this is the normal
  case. Otherwise the board opens at once, as before.
- `useAutoFit` takes the camera from its caller and fits it to a picture that a
  flight arrived at without gliding.
- Three owners hold the answers. Module tests hold the arithmetic and the order
  of events. The browser owner `semantic-board-exploring` holds what only a real
  page can show: the recede, the labels of the far view, and the flight landing
  where it says.

## Amendment of 2026-10-06: a released drag stops, and a label is never hidden

The owner asked for two changes on 2026-10-06 (TASK-403). In the owner's words:
"The momentum where the canvas keeps moving after a drag is released needs to
go. Scroll behavior stays as is." And: "Labels should never be hidden."

**A released drag stops where it is drawn.** This replaces the sentence of
answer 1 that says a released drag carries on at its release speed and slows to
rest. The camera does not move after the hand lets go. The duration
`cameraFling` is gone, and so are the three durations that measured how fast a
drag was let go (`throwTrail`, `throwSpan` and `throwRest`). A picture that
carries on alone moves the part that the reader aimed at out from under them.
The wheel, the pinch and the arrow keys still ease toward where the hand sent
the camera (`EXPLORING_MS.cameraEase`), and a press still stops that ease where
it is drawn.

**A relationship's label is drawn at every zoom.** This replaces the sentence of
answer 2 that says relationship labels go when the picture is seen from far. A
label stays when the surface carries `is-far`. Where the rest of the picture
recedes, under a poke or under a presented step's veil, a label that is not lit
recedes to half its strength and no further, so its words can still be read.
The lines and the cards recede as before. A label that a trace reaches is graded
by its hop, as before.

The browser owner `semantic-board-exploring` now holds that every label is
drawn from far, and that a label that a poke does not light keeps half its
strength. A module owner of the stage holds that a released drag leaves the
camera where it is drawn and asks for no frame.

## Amendment of 2026-10-06: a pinch follows the hand, and the picture changes its look at rest

The owner asked for two more changes on 2026-10-06 (TASK-405 and TASK-406). In
the owner's words: "I don't think we should have easing on pinch to zoom at all,
that just feels bad, so that needs to die like the drag momentum." And of the
flight into a card: "If we could make a nicer transition on those and delay the
update to after the transition completed, that would help a lot on the
experience."

**A pinch has no ease.** This replaces what answer 1 and the first amendment say
of a pinch. A pinch on a trackpad arrives as a wheel event with the Control key
held. A pinch on a touch screen arrives as two pointers. Both move the camera at
once, as a drag does. The picture grows by as much as the fingers asked, and the
part of the diagram under them stays under them. Two fingers on a touch screen
also pan the picture as they move together. The viewport takes touch input for
itself (`touch-action: none`), so a touch screen pinches the picture and not the
page. A turn of the wheel and the keys keep their ease (`EXPLORING_MS.cameraEase`),
because the measurement below showed that the ease was not the cost.

**The camera comes to rest once a hand has left it alone.** The camera store says
whether a hand moves the camera, and where the camera last came to rest. A drag,
a wheel, a pinch or a key sets it moving. It is at rest when its ease has ended
and the hand has left it alone for `EXPLORING_MS.cameraRest` (400 ms). That
duration replaces `trafficRest`, which the traffic waited for before. Three
things follow the rest and not each frame:

- While the camera moves, the surface is a layer of its own (`will-change`), as
  it already was under a drag. The browser scales the picture it already drew
  instead of painting it again. At rest the layer goes, and the picture is drawn
  sharp once at its new size.
- The far view (`is-far`) follows the zoom where the camera comes to rest. A zoom
  that crosses the far line swaps the cards' words for their names once, with
  the picture's own fade, when the zoom is over. Before, the swap and the fade of
  every card ran in the middle of the zoom.
- The traffic waits for the rest, as before.

Measured on the board "Archboard server" of the dogfood vault (about 4000 by 3000
units, fitted at a scale of 0.32), in headless Chromium at 1920 by 1080, with real
input events sent over the DevTools protocol. Each zoom went in, out, in and out,
across the far line. A slow frame is one that took more than 25 ms. Raster is
the time the browser spent drawing tiles. Each number is the median of three runs.

| Zoom                     | GPU before                     | GPU after        | Software before          | Software after    |
| ------------------------ | ------------------------------ | ---------------- | ------------------------ | ----------------- |
| Wheel, 60 notches        | 14 of 328 slow, 1000 ms raster | 0 of 275, 298 ms | 73 of 465, 17825 ms      | 1 of 378, 2109 ms |
| Trackpad pinch, 60 steps | 7 of 327, 968 ms               | 1 of 173, 127 ms | 52 of 467, 16617 ms      | 1 of 199, 1964 ms |
| Keys, 20 presses         | 0 of 132, 372 ms               | 0 of 122, 15 ms  | 1 of 147, 4576 ms        | 1 of 121, 424 ms  |
| Touch pinch, 60 moves    | the picture did not move       | 0 of 97          | the picture did not move | 0 of 106          |

The GPU is the machine's own, through ANGLE and Vulkan. Software is Chromium
with no GPU, so its numbers are worse than any reader's, and they compare only
with each other. After the change, the one slow frame in software is the frame at
rest that draws the picture sharp again. A released drag had that frame before.

**A flight holds the far view until the pane has taken over.** This replaces the
last sentence of "How the picture is marked". The board inside a card no longer
carries `is-far` of its own: it is drawn as the picture around it is. The flight
holds the camera's rest from takeoff until the pane shows the board it flew to,
fitted. So no card, header or caption swaps between its near and far layers in
the air or while the pane takes over. Then the far view follows the opened
board's own fit once, with the picture's own fade. Before, the end of the flight
wrote a camera that was close up. The board inside the card went near, the board
took over drawn near, and its fit sent it far again. In a flight into "Semantic
renderer" that was two swaps and 32 fades of card layers in the 600 ms after the
flight. Now there are none. A reader who asked for no motion and the plain way of
opening a board are not changed.

The frame time of the flight itself did not change. Its mean on the GPU was
20.9 ms before and 21.7 ms after, and the spread from run to run is larger than
the difference. The flight scales two pictures by more than ten times, and the
browser draws them again at each frame. A layer of its own for the surface in the
flight cut that cost by about a third, but it drew the lines of the board inside
the card faint until the board took over sharp. That is a visible event of its
own, so it was not kept.

Owners: the module owner `camera-motion` holds the arithmetic of a pinch. The
stage owner holds that a pinch from a trackpad and from two fingers moves the
camera at once and asks for no frame, and that a keyed zoom keeps the far view
and the layer until it comes to rest. The dive owner holds that a flight between
two boards seen from far changes no far view, and that a board seen from far
that opens from a board seen near swaps once, after it has taken over. The
browser owner `semantic-board-exploring` holds the same in a real page: no card
fades between its layers while the board flown from is on screen, and the board
flown to fades once.

## Amendment of 2026-10-06: the near and the far view swap as one shared element

The owner asked for this on 2026-10-06 (TASK-428): "Add a nice shared element
transition between far and near view content rendering on containers and
cards." Until now each card drew its chip, name and responsibility twice, once
in its near layer and once in its far layer, and the two layers cross-faded.

**A card's chip is one element that both views share.** On a card, on a
container's header and on a card of a sequence, the chip of the part's kind is
one element outside both layers. It stands at its near place by its own
`transform` attribute. The picture's stylesheet moves and scales it to its far
place, the tile down the card's start, while the picture carries `is-far`, and
back again. The places are properties of the element (`--near` and `--far`).

**The words move and fade between their places.** The words of the two views
cannot grow into each other, because the far words are set at another size and
break and cut at other places. So the words of each view stand in a group that
the stylesheet moves to where the other view's words start, at the other view's
size, while their own view is hidden (`--away`). When the views swap, the words
that leave move toward the place of the words that come and fade out in the
first 60 percent of the swap. The words that come arrive from the place of the
words that leave and fade in during the last 60 percent. A flow's heading, which
has no chip, moves its words in the same way. The mark of a board that a part
opens, the warning badge and the standing pin do not move. The two marks fade
where they stand.

**What does not change.** A reader that ignores the stylesheet, an export and a
bitmap of a picture without `is-far` draw the near view, as before, and the far
layer keeps `display="none"`. A document that stands alone sets no theme colour
for the places, because they are no tokens of the page. A reader who asked for
less motion gets the swap at once. A swap still waits for the camera to come to
rest, and a flight still holds it, as the second amendment says. The flight
into a card fades the chip with the card's words. A picture of the same board
that is carried into the next compares a card's content without the places, so
a card that moved keeps its chip and its words and glides with them. The swap
takes `FAR_VIEW_SWAP_MS` (280 ms), which replaces the 180 ms of
`FAR_VIEW_FADE_MS`: the eye has to see the chip travel.

**Cost.** Measured on the board "Archboard server" with the method of the
second amendment: zoom in across the far line, wait for the swap, zoom out
again. The frames from each swap to 450 ms after it count. Three runs, two
swaps each, so six swaps for each setup. The numbers are medians of the runs.

| Swap                     | GPU before | GPU after | Software before | Software after |
| ------------------------ | ---------- | --------- | --------------- | -------------- |
| Mean frame               | 17.0 ms    | 17.0 ms   | 23.7 ms         | 25.7 ms        |
| Slow frames (over 25 ms) | 1 of 55    | 1 of 55   | 13 of 40        | 15 of 37       |
| Slowest frame            | 33 ms      | 33 ms     | 67 ms           | 50 ms          |
| Paint time, two swaps    | 62 ms      | 117 ms    | 76 ms           | 92 ms          |

On the GPU the moving frames of the swap stay within 16.7 ms. The one slow
frame is the frame of the swap itself, which existed before: the browser styles
every near and far layer again for the new class, and the camera's layer goes
in the same frame (a task of about 28 ms in the trace). It came in two of six
swaps before and in three of six after. The paint work of a swap about doubles,
because the chips and the words move in every frame of it. In software that
makes a swap a little slower, and the software numbers compare only with each
other. Limiting the swap to the cards on screen was not needed by these
numbers, so it was not done.

Owners: the module owner `far-view-swap` holds that a card, a container's
header and a sequence's card draw one chip with both places, near by default,
that the words of each view go to where the other view's words start, and that
the stylesheet moves them only while the picture is far and not for a reader
who asked for less motion. The theme owner holds that the places are no tokens
of the page. The picture-transition owner holds that a card that moved keeps
its shared chip.
