# Camera Deck Card

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
[![Validate](https://github.com/eMalinos/camera-deck-card/actions/workflows/validate.yml/badge.svg)](https://github.com/eMalinos/camera-deck-card/actions/workflows/validate.yml)
[![GitHub release](https://img.shields.io/github/v/release/eMalinos/camera-deck-card)](https://github.com/eMalinos/camera-deck-card/releases)

A camera card for Home Assistant dashboards. It shows one camera with a strip of thumbnails, or a two-column grid with 2 or 4 cameras per page. Video comes from [go2rtc](https://github.com/AlexxIT/go2rtc) through the [WebRTC Camera](https://github.com/AlexxIT/WebRTC) integration, so it works on HTTPS and away from home: WebRTC where the network allows it, MSE or HLS otherwise.

| One camera | Grid |
|---|---|
| ![One camera](docs/single.png) | ![Grid](docs/grid.png) |

## Features

- **Layout 1**: one camera with previous / next, the position (`2 / 5`) and a scrolling strip of thumbnails with a status dot.
- **Layouts 2 and 4**: a two-column grid, 2 or 4 cameras per page, with page buttons. Tap a camera to open it on its own.
- **Shared layout**: with `layout_entity` (an `input_select` with options `1`, `2`, `4`) every device follows the same layout.
- **Light on the cameras**: only the cameras you can see stream. Thumbnails are go2rtc frames, refreshed every 10 s while the card is visible, so they reuse go2rtc's connection to the camera.
- **Status**: with an `entity`, a camera whose entity is `unavailable` or `unknown` shows OFFLINE and no player.
- Follows your theme's card background and text colours.

## Requirements

- The **WebRTC Camera** integration (HACS), connected to your go2rtc.
- Your cameras as **streams in go2rtc** (`go2rtc.yaml` → `streams:`). The card refers to streams by name, so camera passwords stay in go2rtc.

## Installation

HACS → ⋮ → Custom repositories → `https://github.com/eMalinos/camera-deck-card`, type **Dashboard** → install **Camera Deck Card** → reload the browser.

## Configuration

```yaml
type: custom:camera-deck-card
title: Kamery
layout_entity: input_select.hfb_cameras_layout
cameras:
  - stream: cam_entry
    name: Vchod
    entity: camera.cam_entry
  - stream: cam_bedroom
    name: Beatka ložnice
```

| Option | Required | Description |
|---|---|---|
| `cameras` | yes | The cameras, in order. |
| `cameras[].stream` | yes | go2rtc stream name. |
| `cameras[].name` | no | Name shown on the camera (default: the stream name). |
| `cameras[].entity` | no | A `camera.*` entity for the OFFLINE status. |
| `title` | no | Heading (default `Kamery`). |
| `layout_entity` | no | `input_select` with options `1`, `2`, `4`. Without it the layout is per device. |

The card is in Czech; there is no visual editor yet.

## Development

`demo.html` renders the card with a stub player and a fake `hass` (serve the folder, e.g. `python3 -m http.server`, and open `demo.html?layout=1|2|4`). Unit tests: `node --test tests/*.test.mjs`.
