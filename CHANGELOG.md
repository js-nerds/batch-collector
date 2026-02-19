# Changelog
All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [0.1.1] - 2026-02-19
### Fixed
- Guard persisted payload shape before using it during recovery from storage.
- Keep flush/replay cycle stable even if one event listener throws an error.
- Eliminate persisted recovery race and ensure async replay behavior is deterministic.

## [0.1.0] - 2026-02-18
### Added
- Initial release with delayed batch flush, configurable timer reset behavior, event subscription API, and optional local/session storage persistence.