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
- `bun run validate`: full gate for type-checking, linting, and tests. Run this before opening a PR.

## Coding Style & Naming Conventions

Use TypeScript with 2-space indentation, double quotes, semicolons, trailing commas, and a 100-character line width. Biome enforces formatting and linting via `biome.json`.

Prefer PascalCase for React components (`WorkspaceSwitcher.tsx`), camelCase for hooks/utilities (`useTheme.ts`), and colocated `*.css` files for component styling. Keep design tokens in `src/styles/global.css`; do not introduce ad hoc color or typography values.

Tauri/WebView constraints matter here: avoid portal-based UI libraries, prefer native HTML plus plain CSS, and attach `useFocusTrap` to each modal dialog. Use Tauri commands or plugins for file access; do not introduce Node-style filesystem APIs into the frontend.

## Testing Guidelines

Write Bun unit tests next to the implementation using `*.test.ts`. Focus on pure helpers, frontmatter parsing, file search, and Tiptap extension behavior. Add regression tests for bug fixes. Run `bun run test` locally, or `bun run validate` for the full check.

## Commit & Pull Request Guidelines

Recent history follows concise Conventional Commit-style prefixes such as `feat:`, `fix:`, `test:`, and `refine:`. Keep subjects imperative and scoped, for example `fix: preserve title when renaming flow files`.

PRs should include a short description, linked issue when applicable, and screenshots or recordings for visible UI changes. Call out Rust/Tauri changes separately, and report the result of `bun run validate` in the PR body.

## Architecture Notes

Preserve the constraints in `CLAUDE.md`: keep the app keyboard-first, writing-focused, and Amytis-native. On-disk files must remain plain Markdown, frontmatter should round-trip cleanly, and user-facing failures should surface through the toast/error path.
