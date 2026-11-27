# Theme Preview Contract

The Admin customizer uses a short-lived signed preview token scoped to one user, tenant, and theme. The token is valid for preview requests only and must never be sent to an untrusted origin.

## Deployment requirements

- `PUBLIC_WEB_URL` must contain the public web origin available to the Admin iframe.
- `PUBLIC_ADMIN_URL` must contain the Admin origin allowed by the web preview CSP.
- Both values must use `https` outside local development.
- Reverse proxies must preserve the configured origins and the `access_token` cookie policy.

Normal public pages remain non-embeddable. Only requests carrying a valid preview token receive the restricted preview `frame-ancestors` policy. The Admin CSP permits framing only from the configured web origin.

Preview paths are relative or must resolve to the configured web origin. Tokens and draft configuration must never be appended to arbitrary external URLs.
