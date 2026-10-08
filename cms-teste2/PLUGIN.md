# Developing a Plugin

A plugin is the extension that registers with the CMS runtime and takes part
in the **hooks and filters** system (transform data, react to content events,
etc.). The catalogue of available hooks is served by the API at
`GET /api/v1/hooks/catalog`.

> The commands use `npx` with the project's local CLI (no global
> install). With the global CLI (`bun add -g @oktis-works/cms`), run
> `okcms ...` directly.

## Generated structure

```bash
okcms plugin:create --name my-plugin
```

```
plugins/my-plugin/
├── manifest.json   # identity + permissions + compatibility
├── index.js        # entrypoint: module.exports.register(registry)
└── README.md
```

### manifest.json

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "my-plugin plugin for OkCMS",
  "type": "plugin",
  "main": "index.js",
  "scope": "tenant",
  "permissions": [],
  "compatibility": { "okcms": "^0.4.28" }
}
```

| Field | Meaning |
|---|---|
| `type` | `"plugin"` (fixed — themes use `"theme"`) |
| `main` | Entry file with the registration |
| `scope` | Scope of action in the multi-tenant setup (e.g. `tenant`) |
| `permissions` | Permissions the plugin requests (empty = none) |
| `compatibility.okcms` | Required semver range of the CMS. **The scaffold fills it in with the current version automatically** and the value is validated at scaffold time and on every install — an incompatible manifest is rejected. |

### index.js

```js
'use strict';

module.exports.register = function register(registry) {
  registry.addFilter('theme:data:posts', (value) => value);
};
```

`register(registry)` is called when the plugin is loaded. Use the registry
to expose filters (transformations) — see what exists at
`GET /api/v1/hooks/catalog` for the available names and contracts.

## Database migrations

If the plugin creates or changes tables, the SQL lives **inside the plugin**:

```bash
plugins/my-plugin/
└── migrations/
    ├── V001__my_plugin__tables.sql
    └── V002__my_plugin__columns.sql
```

The name follows the runner's pattern — `V<number>__<owner>__<name>.sql` — and
the `owner` (here `my_plugin`) is what marks the migration as the plugin's:
tracking is per `owner:version`, so each plugin has its own
version row.

The SQL is **not** applied straight from the plugin directory. `okcms redeploy`
copies `plugins/<n>/migrations/*.sql` into `migrations/` (the only directory
the runner reads) and the deploy's `db:migrate` applies it — so the plugin's
schema stays versioned and reviewable in the project repository.

Two rules the redeploy enforces:

- a file outside the `V###__owner__name.sql` pattern is **never** copied (and one
  already in `migrations/` would break every `db:migrate` — the command
  fails before touching Docker and tells you which file to rename);
- an applied migration is immutable: if a new plugin ships different content
  under the same name, the redeploy does **not** overwrite the file already
  in `migrations/`, it only warns. Ship a `V00n+1`.

## Development workflow

```bash
# 1. Create it (in the project's ./plugins, or an external workspace with --dir)
okcms plugin:create --name my-plugin

# 2. Implement plugins/my-plugin/index.js

# 3. If you created it OUTSIDE the project, install it (validates compatibility and copies into plugins/)
okcms plugin:install --name ../my-plugin-source

# 4. Management
okcms plugin:list                                # installed + status
okcms plugin:manage -n my-plugin --info          # manifest information
okcms plugin:manage -n my-plugin --disable       # disables (keeps the files)
okcms plugin:manage -n my-plugin --enable        # enables it again
okcms plugin:manage -n my-plugin --uninstall     # removes files + registration

# 5. Search npm (packages with the okcms-plugin keyword)
okcms plugin:search -q gallery

# 6. Published/updated? Stage the SQL + build the themes + blue/green deploy
okcms redeploy --dry-run   # only shows the plan
okcms redeploy
```

## Publishing

Package the plugin directory as an npm package with the keyword
`okcms-plugin` (that is what `okcms plugin:search` queries) and keep
`compatibility.okcms` up to date for the CMS line you support.
