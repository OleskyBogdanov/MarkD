# Bundled document fonts

All source fonts and per-family license files came from the official
[`google/fonts`](https://github.com/google/fonts) repository at commit
`f6b2b7e8545e086ad3f821af21895d732b6485cf` (2026-09-02).

The original TTF files were converted without subsetting to WOFF2. The WOFF2
catalog contains 41 files across 20 families and is about 14 MiB. Its aggregate
SHA-256 (SHA-256 over the sorted `shasum -a 256` output) is:

`fd6d4c226928f15530797378170f235cf245c17c0936c38ded0eb6061d10ac09`

Every family directory contains its upstream `LICENSE.txt`. Nineteen families
use SIL Open Font License 1.1. Roboto Slab uses Apache License 2.0. The renderer
imports these license files as build assets so they are included in packaged
MarkD distributions.

The family chains use bundled Noto Sans, Noto Serif, or JetBrains Mono as their
deterministic fallback. This covers characters such as the ruble sign in the
few primary families that do not contain it themselves, without relying on an
operating-system font.
