# Theme Development Reference

This locale file now points to the single English v1 contract. Themes are
independent React or Solid projects compiled for SSR and connected to the host
only through `ThemeSdkBridge`.

Read [THEME.md](../THEME.md) and
[theme-development.md](./theme-development.md) for the complete contract,
`render(key, data, context, sdk)` examples, dependency isolation, logical-key
inheritance, artifact validation, and migration without legacy templates.

Version 1 does not provide an adapter for the removed string renderer. Existing
themes must be rebuilt as React or Solid themes.
