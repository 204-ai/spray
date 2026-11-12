# SPRAY by JAS.BLACK

Version 1.0.0

**A 3D graffiti wall studio in the browser: real spray caps, paint markers, image guides, auto paint and time-lapse export.** By [JAS.BLACK](https://jas.black).

**[Open it: spray.jas.black](https://spray.jas.black)** · **[The guide: every control, how it works](docs/GUIDE.md)**

![SPRAY console](docs/screenshot.png)

Spray puts a floating spray can in front of a yard of walls. Paint lands on the surface the way it does outside: soft mist from far away, sharp lines up close, and drips when you hold still too long. Drop any picture onto a wall and it becomes a see-through guide, split into numbered colour shapes and outlines to paint over. Auto paint can then paint it for you, the way a writer would, and record the result as a time-lapse. Everything runs on your GPU in the browser. Nothing is uploaded and no account is needed.

## Quick start

1. Open [spray.jas.black](https://spray.jas.black) in a current desktop Chrome, Edge, Firefox or Safari. WebGL 2 is required.
2. Hold the left mouse button to spray. Pick a cap and a colour in the panel on the left.
3. Drop an image onto any wall to get a guide. Use **images** mode to move, scale and rotate it.
4. Press **auto paint** (images tab) to watch it painted, with **record time-lapse** on to save a video.
5. Press **⟲ back to wall** whenever you get lost in the yard.

| Key | Action |
| --- | --- |
| Hold click / Space | Spray or draw |
| Wheel | Zoom |
| Middle-drag | Look around (Shift: pan) |
| W A S D | Walk |
| P · M · B | Paint · images · build mode |
| T | Spray can / paint marker |
| [ ] | Previous / next cap |
| X | Buff (erase) |
| Home | Back to the last wall you painted |
| Ctrl Z / Ctrl Shift Z | Undo / redo |
| H | Hide / show tools |

See the **[guide](docs/GUIDE.md)** for every control.

## Run locally

Clone the repo and serve the folder, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. `index.html` needs `vendor/three.min.js` beside it. Icons live in `public/` and are copied next to the page on deploy.

## Station mode (204-ai fork)

For running Spray as a picture source in a studio, with no mouse: URL parameters switch it on, and without them the page is the same as upstream.

| Parameter | What it does |
| --- | --- |
| `kiosk=1` | Picture only: no bar, panel, HUD or messages. |
| `whip=<url>` | Publishes the picture to a WHIP endpoint, for example mediamtx at `http://localhost:8889/spray/whip`. |
| `depthcam=<url>` | Hands from a [depthcam-studio](https://github.com/204-ai/depthcam-studio) server, for example `http://localhost:8777`: the body pose from its colour video, reach from its depth frames. |
| `trigger=reach\|raise\|fist` | What sprays. `reach` (default): the hand held out toward the camera, about 28 cm in front of the shoulder, and the further out the closer the can. `raise`: the hand above its shoulder. `fist`: a closed hand, read by the hand tracker on a close-up cut around each wrist. The **K** key steps through them. |
| `mirror=0` | Left and right as the camera sees them (default: as in a mirror). |
| `debug=1` | A small view of what the tracker sees. |
| `video=<url>` | With `depthcam`: a video file in place of the camera, for trying gestures with nobody there. |

The wrist aims the can inside a box around the shoulders, so it works wherever the person stands. One person paints with both hands; two people get a can each. A hand hanging down holds no can.

Example: `http://localhost:8807/?kiosk=1&depthcam=http://localhost:8777&whip=http://localhost:8889/spray/whip`

The trackers load from cdn.jsdelivr.net and storage.googleapis.com, like upstream's hand tracking. The page's content policy lets it connect to any http(s) address, because the camera and the media server are given by URL.

## Development

```
src/            editable source
  body.html     markup
  style.css     styles (JAS.BLACK console tokens, light + dark)
  a1_core.js    renderer, camera, scene, state
  a2_materials.js  procedural wall surfaces (albedo, height, gloss, AO)
  a3_walls.js   walls, yard layout, parallax wall shader
  a4_paint.js   caps, markers, paint splats, drips, mist
  a5_guide.js   image guides: colour shapes, outlines, numbers
  a6_auto.js    auto paint planner and time-lapse
  a7_input.js   mouse, keyboard, touch
  a8_ui.js      panel and top bar
  a9_extras.js  hand tracking, colour picking, live room
  a12_station.js  station mode: kiosk view, depth cam hands, WHIP out (204-ai fork)
  a11_store.js  autosave (IndexedDB) and project files
  a10_boot.js   start-up and render loop
  model.js      the JAS spray can mesh and label texture
build.py        inlines src/ into index.html
index.html      built page (committed)
vendor/         three.js r128
public/         icons, web manifest and link-preview card (deployed beside the page)
design/         sources for the icons
```

Edit files in `src/`, then rebuild and commit `index.html` with your changes:

```sh
python3 build.py
```

CI fails if `index.html` is out of date with `src/` (`python3 build.py --check` runs the same test locally).

## Deployment

`.github/workflows/pages.yml` checks the scripts, checks the build and publishes to GitHub Pages on every push to `main`.

One-time setup:

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Same page, **Custom domain:** `spray.jas.black`, then tick **Enforce HTTPS** once the certificate is issued.
3. At your DNS provider, add a `CNAME` record: `spray` → `jasblack.github.io`.

## Status

Works in current desktop browsers. Phones and tablets can paint with touch, but the panel is cramped on small screens. Hand tracking needs a webcam and downloads the MediaPipe hand model from cdn.jsdelivr.net and storage.googleapis.com when you start the camera. Live multi-user painting only works when Spray is opened as a shared Claude artifact, so it is hidden on the website.

## Licence and credits

MIT, see [LICENSE](LICENSE). Built by [JAS.BLACK](https://jas.black).

- [three.js](https://threejs.org) r128, MIT.
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) hand landmarker, Apache 2.0, loaded on demand.
- [Archivo](https://fonts.google.com/specimen/Archivo) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), SIL Open Font License, via Google Fonts.
- Spray can model and label: JAS.BLACK.

Part of the JAS.BLACK tool family with Code Painter ([paint.jas.black](https://paint.jas.black)), SnipSnap ([snap.jas.black](https://snap.jas.black)), Fault ([fault.jas.black](https://fault.jas.black)) and Growth ([growth.jas.black](https://growth.jas.black)).
