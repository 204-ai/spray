# SPRAYLAB / FIELD NOTES

Every control in Spraylab, and what it is doing underneath.

## The console

- **Top bar.** The mode switch (**paint · images · build**), status lights (**saved**: the yard autosaves in this browser; **hands**: lit while the camera is tracking), the transport keys (**undo**, **⟲ back to wall**, **redo**, **rec**), then **? guide**, **▤ tools**, **⛶** full screen and **◐** light / dark.
- **Panel.** Four tabs: **Paint**, **Images**, **Yard**, **More**. **H** hides it, and the 3D view takes the full width.
- **Monitor.** The yard. The green strip underneath shows the cap, the can's distance from the wall, the spray width, the pressure (or the ink level for markers) and the mode.

## Moving around

| Input | Does |
| --- | --- |
| Wheel | Zoom toward the cursor |
| Middle-drag (or right-drag) | Look around |
| Shift + middle-drag | Pan |
| W A S D | Walk |
| F | Fly to the wall under the cursor |
| Home, or ⟲ back to wall | Back in front of the last wall you painted |
| Two fingers (touch) | Look around, pinch to zoom |

## Paint tab

**Spray can or paint marker** (**T** switches).

**Caps.** Needle, Pro Skinny, Stock, Soft Fat, NY Fat, Astro Fat, Flat Fan and Splatter. Each has its own spray cone, droplet size and flow. The note under the caps says what each is for. **[ ]** steps through them. Flat Fan and the chisel markers have a **tip angle** (**Q / E** turn it).

**Markers.** Round tips (0.7, 1.3, 2.5, 8 mm) and chisel tips (15, 18 mm). Markers paint at contact and follow the wall's relief: a big tip skips over the deep parts of brick and render. **R** pumps the marker when the ink runs low.

- **Distance** (**Z / C**, or Alt + wheel): how far the can is from the wall. Closer gives a thinner, wetter, sharper line. Further gives a wide, soft mist.
- **Pressure**: how much paint comes out. **R** shakes the can.
- **Drips**: how readily wet paint runs. 0 turns drips off.
- **Paint / buff out** (**X**): buffing erases paint back to the bare wall.

**Colour.** 36 swatches (**1–9** pick the first nine), a custom picker, colours taken from the selected image, and your recent colours. **Pick** (**I**, or Alt + click) takes a colour off the wall.

Hold **Shift** while painting for a ruler-straight line, level or plumb.

## Images tab

Drop images onto any wall where you want them, paste them, or click the drop box. Each becomes a layer.

- **Shapes / Line art / Both**: how the image is broken up for tracing.
- **Height, Rotation**: size and angle on the wall. In **images** mode (**M**) you can also drag, scale and rotate it directly.
- **Colours**: how many paint colours the image is reduced to (2–16). **Detail**: how fine the shapes are.
- **Outlines, Colour fills, Numbers, Photo**: which guide layers show. Line colour, **Opacity** and **Line** width.
- **Arrange, Look at it, Hide guides** (**G**), **Remove this image**.

**Auto paint** paints the selected image, or every image on its wall, like a writer would: a light sketch, big fills with fat caps, edges cut in with skinny caps, then outlines. **Speed** sets how fast. The options: every image on the wall, record time-lapse, frame the piece, sketch first, hide the guide while painting, start on a clean wall. **Esc** stops.

## Yard tab

**Build** mode (**B**): add a **wall**, **hoarding** or **train car**, click to select, drag to move, **Q / E** to turn. Set **width** and **height**, duplicate or delete, and choose a **surface**:

Red brick · Yellow stock brick · Painted brick · Poured concrete · Board-formed concrete · Raw cinder block · Painted cinder block · Rough render · Rubble stone · Buffed hall of fame · Black hoarding · Roller shutter · Corrugated sheet · Subway tile · Freight car steel · Stainless subway car.

Each surface is a tileable material with its own height, gloss and ambient occlusion. The wall shader uses parallax occlusion, so paint sits in the surface rather than on top of it.

**Scene**: Day, Golden hour, Overcast or Night lighting, the aim ring, sound and volume.

## More tab

- **Your work**: undo / redo, save and open a project file (.json), save a photo of the view, save a flat PNG of the wall, record a video of the view, clear the wall, start a new yard. The yard autosaves in this browser.
- **Hand tracking**: **Start camera**. An open hand aims, a closed fist sprays. Two people can each use a hand; player 2 has their own colour.
- **Controls**: the full key list.

## Saving

| What | How |
| --- | --- |
| Autosave | Always on. Stored in this browser only. |
| Project file | More → Save project file. Open it again with Open project file. |
| Photo / flat PNG | More → Save photo / Save flat PNG. |
| Video | **rec** in the top bar, or More → Record video. |
| Time-lapse | Images → Auto paint with **record time-lapse** on. |
