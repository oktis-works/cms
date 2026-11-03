---
'@oktis-works/config': patch
---

Fix JWT key generation: `generateRsaKeyPairSync()` now produces real RSA key
pairs (PKCS#8 private key, SPKI public key, base64url-encoded) instead of
truncated base64 strings derived from JWT_SECRET. The previous output was not
valid PKCS8/SPKI and caused `crypto.subtle.importKey` to fail with
`DOMException: Invalid keyData`, breaking JWT sign/verify and all auth login
(401). When `JWT_KEYS` env is not set, a real RSA 2048-bit key pair is generated
at config load time.
