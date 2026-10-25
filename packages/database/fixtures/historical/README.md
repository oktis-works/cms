# Historical PostgreSQL upgrade fixtures

The fixtures are applied after the canonical fresh snapshot so the acceptance
job exercises real SQL against a disposable PostgreSQL server while keeping the
fixture corpus reviewable. They represent the release boundaries supported by
the current package line and the former dual-source bootstrap.

`postgres-upgrade-acceptance.mjs` creates an isolated database for every
boundary, applies the fixture, runs the normal bootstrap and migration runner,
and verifies that the resulting baseline is current. A fixture is not allowed
to rewrite the migration ledger silently.
