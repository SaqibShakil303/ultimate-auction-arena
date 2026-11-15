# Arena image generation notes

Two original environments were created with the built-in image generation tool and converted to 1280-pixel JPEGs at quality 84. They contain no official footballer or Marvel portraits. Generation originals remain in `.codex/generated_images/01a1dc61-0bb6-7aa1-8cd5-aebfbfa60499` under the user's profile.

## Football creative brief

An original cinematic stadium: empty grass, floodlights, a floating gold collectible-card frame, electric blue and neon lime energy, particles and a premium sports atmosphere. No people, licensed character art, logos or text.

- Asset: `public/assets/arena-football.jpg` — 189,170 bytes.
- Original: `exec-0a1f5522-517e-4713-8726-cdd0b16145be.png`.

## Heroes creative brief

An original futuristic command center with a holographic collectible-card portal, purple, cyan, red and gold lighting, sci-fi energy and cinematic depth. No licensed characters, franchise logos or text.

- Asset: `public/assets/arena-heroes.jpg` — 195,396 bytes.
- Original: `exec-5a77b25f-39ac-4614-8d02-2e8487ef9e13.png`.

Character fallbacks are deterministic SVG silhouettes/emblems in `src/components/GameCard.tsx`. Identity, nationality/club and hero class drive their colors and motifs. They are not represented as photographs or licensed character illustrations. Source metadata lives in `shared/imageManifest.ts`.
