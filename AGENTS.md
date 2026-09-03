# Project Guide

## Product

Build `H3 2.5D 狙击挑战`, a desktop-first browser game. The experience is a cinematic observation scene, location-preserving scope view, hidden target, single-shot win/lose outcome, rich audio cues, and restart.

## Hard Constraints

- Use React, Vite, and TypeScript unless a verified repository constraint requires otherwise.
- Keep scene, grid, target, timing, and audio data in validated typed configuration.
- Use normalized coordinates relative to the actual rendered video rectangle.
- Keep the wide view and scope view on the same media clock.
- Do not show a numeric countdown.
- Do not add accounts, backend services, analytics, leaderboards, gore, real people, military factions, or third-party game IP.
- Target desktop mouse and keyboard only for this delivery.
- Do not commit generated video, audio, screenshots, recordings, secrets, IDs, account data, or provider responses.
- Do not copy `.env.local` into examples or logs. `.env.example` may contain empty variable names only.
- Preserve the existing `联系我` and `赞助` sections and their assets in `README.md`.

## Evidence

Before reporting success, run tests and a production build, then verify the full visible flow in the in-app browser: load → start → choose scene → observe → scope → hit and timeout paths → retry. Fix relevant warnings and console errors.
