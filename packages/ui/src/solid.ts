// Re-export SolidJS for Admin-UI to avoid direct solid-js import violation (SDD layer frontend)
// SDD-ALLOWED: solid-js is frontend, Admin-UI may import via @oktis-works/ui
export { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup, type JSX } from "solid-js";
