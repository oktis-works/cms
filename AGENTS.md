# Agent Instructions & Project Rules

This document defines strict operational rules and workflows that the AI Agent must execute during development, commit, and deployment phases.

## 1. Commit Message Standard
* **Language:** Every commit message must be written in English.
* **Format:** Use the full Conventional Commits specification. This includes types such as `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, etc.

## 2. GitHub & CI/CD Pipeline Workflow
Before preparing or recommending a push to GitHub, evaluate if the updates trigger the CI/CD and Publish workflows. If they do, the following actions are mandatory:

### CMS Versioning & Tagging
1. **Locate CMS_VERSION:** Check the current version specified in the `CMS_VERSION` variable or configuration file.
2. **Bump Version:** Determine the next version number based on the nature of the changes (Major, Minor, or Patch).
3. **Update File:** Apply the new version directly to the `CMS_VERSION` variable in the codebase.
4. **Git Tagging:** Create a new Git tag that matches exactly the updated `CMS_VERSION` (e.g., `v1.2.3`). This tag must be pushed to GitHub to trigger the release workflow.

### Individual Package Management via Changeset
* **Verification:** Always check for package updates using `changeset`.
* **Flow:** Ensure changesets are generated for individual packages when changes occur, and that they are consumed (`changeset version`) to bump the package versions independently before the final publish execution.
