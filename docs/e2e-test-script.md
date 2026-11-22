# SameWave end-to-end test script

Use a **local `api-server`** pointed at Neon **TEST** branch `br-ancient-pine-aqwxwgt2` (project `shiny-base-39439212`). Never write test data to production / live.

Prefer a **release Android build on an emulator** for steps 1–7 and 9. Use a **dev build only for step 8**. If an emulator is unavailable, use the closest available client (Expo Go / web) and record which.

For each step record **PASS/FAIL**, exactly what was seen on screen, and a screenshot under `/opt/cursor/artifacts/`.

## Steps

1. Launch the app; confirm it loads without crashing.
2. Sign in or use the existing test account.
3. Create a new Ripple: pick a photo, select feeling **Wonder**, pick a topic, upload. (Also confirm the stored row has `emotion='awe'`.)
4. Match screen: the lower photo shows the real feeling and topic; location stays hidden until the wave; the blur-in animation works (seed a second test user's photo so there is a match).
5. Pinch-zoom the map: zoom tracks fingers smoothly, no jump when one finger lifts, pins stay the same size while zooming, guessed-location pins appear as hollow approximate pins.
6. Trigger a wave reveal; confirm the Kevin MacLeod clip plays at the reveal.
7. Account: Privacy, Terms, Data deletion links, music credits by name, version number, and the line `© 2026 SameWave Studios. All rights reserved.` with a capital W.
8. **Dev build only:** open the hidden location check screen under Account; confirm it shows whether each photo's country came from GPS, photo data, or fallback (and confirm it is absent from the release build).
9. Ripple tab heading says `What's the topic?`; concentric rings absent from the Ripple tab but present on the loading screen.
10. Run the full test suite; confirm all pass (was 165 before the Wonder tests; report the actual count).

## Afterward

- Clean up any test rows created on the Neon test branch.
- Do **not** push to `main`, upload to Play, or merge PRs.
