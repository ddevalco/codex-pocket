# Packet 3: Home Route Color Mix Consistency

**Packet ID:** `p2-home-inconsistent-mix-patterns`
**Status:** Complete
**GitHub Issue:** #270

## Summary

Resolved inconsistent usage of `color-mix(in oklab)` and hard-coded state indicator colors in `src/routes/Home.svelte`. Standardized on `oklch` color space and semantic tokens.

## Transformations

### Color Space Standardization

- Converted 4 instances of `color-mix(in oklab, ...)` to `color-mix(in oklch, ...)` in pill/chip styles.

### Hard-coded Color Replacements

Replaced 3 hard-coded hex values with semantic CSS variables:

- Idle: `#2fd47a` → `var(--cli-success)`
- Working: `#f2c94c` → `var(--cli-warning)`
- Blocked: `#eb5757` → `var(--cli-error)`

## Validation Results

### Build

- **Command:** `bun run build`
- **Result:** Pass (✓ built in 4.36s)

### Type Check

- **Command:** `bun x svelte-check --tsconfig ./tsconfig.json`
- **Result:** Pass (0 errors and 0 warnings)

## Visual Risk Assessment

- **Pill/Chip Contrast:** The shift from `oklab` to `oklch` may cause subtle shifts in the mixed color result. Given the transparency levels (10%, 14%, 35%, 40%), the impact should be minimal but should be visually verified, especially in dark mode, to ensure text legibility remains high against the background.
- **State Indicators:** The semantic tokens (`--cli-success`, `--cli-warning`, `--cli-error`) act as the source of truth. The replaced hex values were approximations of these tokens. Using the tokens ensures consistency across the application themes (light/dark).

## Next Steps

- Manual visual QA in light and dark modes to confirm contrast.
- Handoff to Orchestrator.
