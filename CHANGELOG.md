# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-23

### Added
- **Review Module Upgrade**: WXS-driven flashcard swiping with dual-threshold feedback.
- **Multi-sensory Feedback**: Integrated haptic (vibration) and audio feedback for flashcard actions.
- **Improved Performance**: `setData` payload optimization for Quiz and Flashcard pages.
- **SWR Caching**: Implemented stale-while-revalidate caching for Review module API calls.

### Changed
- **UI/UX Refinement**: Removed all emojis from frontend UI for a professional aesthetic.
- **Copywriting Optimization**: Unified and improved all frontend copywriting based on brand guidelines.
- **Code Quality**: Enforced high-performance coding patterns and cleaned up ESM-related linting warnings.

## [1.0.1] - 2025-10-22

### Fixed
- Align requireRole tests with JWT-based role checks; backend tests 74/74 pass (bookworm-backend/src/tests/authPlugin.test.ts:35)
- Remove deprecated `miniprogram/utils/auth.js` and dead import in pages/orders/index.js
- ESLint cleanup: remove unused `Order` import in `bookworm-backend/src/services/sellOrderService.ts`
- Remove unused variable in `miniprogram/pages/acquisition-scan/index.js:217`
- Simplify 401 error handling in `miniprogram/utils/api.js` (remove useless try-catch wrapper)

### Added
- `miniprogram/utils/logger.js` - unified logging facade with DEBUG_MODE support
- ESLint enforcement for `no-console` rule in miniprogram (miniprogram/.eslintrc.json)
- CI guard to prevent console.* usage outside whitelisted files (.github/workflows/ci-lint-scan.yml:66)
- Pre-commit hook for ESLint validation and console.* guard (.husky/pre-commit)
- Husky v9.1.7 for git hook management (package.json:19)

### Changed
- Replace all console.log/error/warn with logger facade in 8 frontend files (auth-guard.js, profile/index.js, acquisition-scan/index.js, book-detail/index.js, market/index.js, webview/index.js, cache.js, config.js)
- Update backend lint scripts to remove deprecated `--ext` flag (bookworm-backend/package.json:17)
- Update CI workflow to include backend tests and remove `--ext` flag (.github/workflows/ci-lint-scan.yml:42)
- Enforce three-layer console.* prevention: ESLint (dev) + pre-commit (commit) + CI (PR/push)

### Documentation
- Mark `miniprogram/utils/auth.js` as deprecated and removed in SECURITY_NOTES.md
- Add "Known Limitations" section documenting JWT role delay, singleton login scope, and 401 retry strategy (SECURITY_NOTES.md:115)

## [1.0.0] - Initial Release
