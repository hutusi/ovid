# Repository Guidelines

## Project Structure & Module Organization

Ovid is a Tauri 2 desktop app with a React/TypeScript frontend and Rust backend. `src/App.tsx` owns global workspace/editor state. Put UI in `src/components/`, shared hooks/helpers in `src/lib/`, Tiptap extensions in `src/lib/tiptap/`, and theme/editor CSS in `src/styles/`. Static assets live in `public/` and `src/assets/`.

`src-tauri/` contains Tauri commands, config, capabilities, and icons. Tests are colocated with the code they cover, for example `src/lib/frontmatter.test.ts` and `src/lib/tiptap/FindReplace.test.ts`.

## Build, Test, and Development Commands

- `bun install`: install frontend dependencies.
- `bun run tauri dev`: run the desktop app locally with hot reload. Requires Rust.
- `bun run build`: build the frontend bundle with TypeScript checks.
- `bun run tauri build`: build the distributable desktop app.
- `bun run test`: run unit tests with Bun.
- `bun run lint`: run Biome checks on `src/`.
- `bun run validate`: full gate for type-checking, linting, tests, frontend build, and `cargo test`. Run this before opening a PR.

## Coding Style & Naming Conventions

Use TypeScript with 2-space indentation, double quotes, semicolons, trailing commas, and a 100-character line width. Biome enforces formatting and linting via `biome.json`.

Prefer PascalCase for React components (`WorkspaceSwitcher.tsx`), camelCase for hooks/utilities (`useTheme.ts`), and colocated `*.css` files for component styling. Keep design tokens in `src/styles/global.css`; do not introduce ad hoc color or typography values.

Tauri/WebView constraints matter here: avoid portal-based UI libraries, prefer native HTML plus plain CSS, and attach `useFocusTrap` to each modal dialog. Use Tauri commands or plugins for file access; do not introduce Node-style filesystem APIs into the frontend.

## Testing Guidelines

Write Bun unit tests next to the implementation using `*.test.ts`. Focus on pure helpers, frontmatter parsing, file search, and Tiptap extension behavior. Add regression tests for bug fixes. Run `bun run test` locally, or `bun run validate` for the full check.

## Commit & Pull Request Guidelines

Recent history follows concise Conventional Commit-style prefixes such as `feat:`, `fix:`, `test:`, and `refine:`. Keep subjects imperative and scoped, for example `fix: preserve title when renaming flow files`. Avoid `Co-Authored-By` trailers.

For a new feature or non-trivial change, work on a dedicated `feat/<topic>` branch off `main` (not directly on `main`) and commit in focused slices — one logical change per commit (e.g. split a dead-code removal from the feature that replaces it) — keeping `bun run validate` green at each commit so the branch stays bisectable. Update tests and docs in the same change: extend tests for new behavior (Rust parsers, pure helpers, sidebar projections), and update `CONTEXT.md` (concepts/seams), an ADR (new decisions), and `README.md` / `ROADMAP.md` (user-facing capability) whenever behavior or a documented concept changes. `bun run validate` fails on generated-type drift and locale-parity, so regenerate via `cargo test` and keep both locale files in sync.

Open a PR into `main` once the branch is green; include a short description, linked issue when applicable, and screenshots or recordings for visible UI changes. Call out Rust/Tauri changes separately, and report the result of `bun run validate` in the PR body. Committing, pushing, and opening PRs are actions the user authorizes — do not push or open a PR unless asked.

## Architecture Notes

Preserve the constraints in `CLAUDE.md`: keep the app keyboard-first, writing-focused, and Amytis-native. On-disk files must remain plain Markdown, frontmatter should round-trip cleanly on plain editor saves, and user-facing failures should surface through the toast/error path.

Content creation mirrors Amytis conventions — type is derived from the bucket folder (not a `type:` field) and new files are scaffolded by `src/lib/amytisScaffold.ts` to match the Amytis `new-*` scripts (ADR 0009). A `type: collection` series references its members via an `items:` list rendered as sidebar links and edited in place (ADR 0010). Note: *structured* frontmatter edits (the properties panel, and collection `items:`) re-serialize the frontmatter block rather than round-tripping it verbatim — comments in those files are not preserved.
