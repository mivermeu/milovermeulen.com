# Transit

Live NYC subway map. Static SvelteKit app (base `/transit`) reading the snapshot and track graph
published by `services/transit` — no backend code lives here, the browser only fetches JSON, a shape
buffer and a PMTiles archive.

```bash
bun run dev      # http://localhost:5177/transit
bun test
bun run check
```

## Data flow

| Module               | Role                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| `src/lib/data.ts`    | manifest → graph → `shapes.bin` → snapshot, with graph-hash verification    |
| `src/lib/sim.ts`     | snapshot → `TrainMotion`; extrapolates along the pattern between 30 s polls |
| `src/lib/map.ts`     | MapLibre layers: basemap, network lines, stations, trains, selection        |
| `src/lib/basemap.ts` | PMTiles protocol + the dark, labels-free basemap style                      |
| `src/lib/palette.ts` | official MTA route colours                                                  |
| `src/lib/types.ts`   | the wire contract and the client-side motion/position shapes                |

The API base defaults to the deployed service and can be overridden with `VITE_TRANSIT_API_URL`.

## Basemap

The streets come from a self-hosted [PMTiles](https://pmtiles.io) extract of the Protomaps basemap,
z10–13 for the NYC area (~21 MB). It is **not committed**:

```bash
scripts/fetch-transit-tiles.sh          # needs `brew install pmtiles`
```

That writes `static/tiles/nyc-basemap-z13.pmtiles` (gitignored), which the dev server serves with
Range support. For production, upload the same file to `<site>/transit/tiles/` — the CI build
deliberately does not carry it. Point `VITE_TRANSIT_TILES_URL` at another host if needed.

If the archive is missing the map still renders; only the streets are absent, with one console
warning. OSM attribution is shown in the legend.

## Rendering notes

- MapLibre 6 is ESM-only and splits its worker into a separate chunk. `maplibre-worker.ts` imports
  that chunk as a URL and calls `setWorkerUrl()`; without it every render task fails with "Worker
  failed to load".
- Train positions are published to the GeoJSON source at ~12 Hz. `setData` re-tiles on the worker,
  so per-frame publishing spends a round-trip per frame for sub-pixel movement.
- The map container needs an explicit height: MapLibre sets `position: relative` on it, which
  defeats `absolute inset-0` sizing.

## Motion and uncertainty

The client does not integrate a velocity. The server ships a timeline (`depart_at` plus the next six
stop arrivals) and `sim.ts` evaluates a trapezoidal profile against wall-clock time, so the 30 s
poll cadence never enters the render path. A snapshot replaces the timeline, not the dot; the
displayed position eases toward the new estimate (4 s time constant, 60 m/s cap). Corrections above
400 m — a skipped stop or a feed gap — are adopted immediately and faded in over 0.7 s, because
gliding half a kilometre is worse than a blink.

Uncertainty is **along the track, never radial**. A circle would imply lateral freedom a train does
not have and would overlap neighbouring lines. For the selected train only, the map draws the
current edge as a translucent bracket — the stretch between the stop it left and the stop it has not
reached. While the train is dwelling the bracket is empty, because its position is the platform; the
inspector shows `departs in ~Ns` instead. `sigma` (metres) is the numeric estimate and is shown in
the inspector, not as a halo.

## Tests

`bun test` covers the data contract, the sim/projection maths, the GeoJSON builders, the route
palette and the formatting helpers. MapLibre itself is exercised in the browser, not in unit tests.
