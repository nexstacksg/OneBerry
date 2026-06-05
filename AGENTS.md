# Repository Guidelines

## Project Structure & Module Organization

LightNVR is a C/CMake application with a Vite web interface. Core C sources live in `src/`, with headers mirrored under `include/` by domain (`core`, `database`, `storage`, `video`, `web`). Database migrations are in `db/migrations/`. Runtime configuration examples live in `config/`, `examples/`, and `go2rtc/`. Frontend source and assets are under `web/js`, `web/css`, and `web/img`; production assets are emitted to `web/dist/`. Tests are split between C tests in `tests/unit` and `tests/database`, Playwright specs in `tests/integration/specs`, and load tooling in `tests/load`.

## Build, Test, and Development Commands

- `bash scripts/build.sh --debug` builds the C backend with tests enabled.
- `bash scripts/build.sh --release` creates an optimized release build.
- `bash scripts/build_web_vite.sh` installs/builds frontend assets into `web/dist/`.
- `cd web && npm run start` starts the Vite frontend dev server.
- `npm test` runs Playwright integration tests from the repository root.
- `npm run test:api`, `npm run test:ui`, and `npm run test:go2rtc` run integration subsets.
- `ctest --test-dir build` runs CTest after a CMake build.
- `npm run fallow:audit` checks duplication/audit baselines.

## Coding Style & Naming Conventions

Use C for backend modules and ES modules for frontend code. Match local formatting: C uses 4-space indentation and `snake_case` names such as `storage_manager.c`; JavaScript uses 2-space indentation and kebab-case utility filenames such as `url-utils.js`. Keep headers in the matching `include/<domain>/` directory. Prefer small domain-focused modules. Run `clang-tidy -p build/compile_commands.json src/**/*.c` when touching C logic.

## Testing Guidelines

Name C tests `test_<feature>.c` and register new executables in the relevant `tests/CMakeLists.txt`. Name integration specs by type: `*.api.spec.ts`, `*.ui.spec.ts`, or `*.go2rtc.spec.ts`; Playwright projects select tests from these suffixes. Add focused tests for database migrations, stream behavior, API handlers, and frontend workflows. Use `LIGHTNVR_URL=http://host:port npm test` to target a non-default server.

## Commit & Pull Request Guidelines

Recent history uses concise subjects such as `feat: ...`, `Refactor ...`, and merge commits from feature branches. Keep commit messages imperative and specific; use a conventional prefix (`feat:`, `fix:`, `test:`, `docs:`) when it fits. Pull requests should describe the change, list verification commands, link issues, and include screenshots or recordings for visible UI changes. Note configuration, migration, or deployment impacts.

## Security & Configuration Tips

Do not commit camera credentials, tokens, private stream URLs, or host-specific paths. Use `config/lightnvr-test.ini` and `config/go2rtc/go2rtc-test.yaml` for test setups. When editing logging, screenshots, or docs, obfuscate RTSP credentials and user-identifying data.
