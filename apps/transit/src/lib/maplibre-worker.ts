import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre resolves its worker as `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
// That breaks as soon as a bundler copies the library out of its own directory — Vite
// pre-bundles it for dev and rewrites the module graph for production, so the relative
// URL points at nothing and every tile/render task fails with "Worker failed to load".
// Importing the worker as a URL asset makes Vite emit (dev: serve) it, and MapLibre's
// public hook points the pool at it.
setWorkerUrl(workerUrl);
