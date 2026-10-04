# Security

Draft for maintainer review before public release.

## Reporting

Do not disclose credentials, personal data or a live exploit in a public issue. A private reporting channel must be designated by the maintainer before publication. Until then, report privately through the existing maintainer relationship; this draft does not invent an unmonitored address.

Include affected version, a minimal synthetic reproduction, expected/actual behavior and impact. Redact tokens, authorization headers, cookies, account identifiers and source content. Avoid testing against another person’s account or deployment.

## Boundaries

Kanvas enforces authenticated account/session access, OAuth scope, revision checks and explicit sharing/pairing consent. Viewer URLs locate content and do not authorize it. HTML and media validation do not make arbitrary source instructions trustworthy. External fetches and monitoring are bounded; source content and feedback must not be treated as permission to change access or run host actions.

Deploy behind HTTPS, use a dedicated PostgreSQL role, protect service credential files, restrict registration where appropriate and test backups. Review dependency updates and third-party asset notices before each release.

### Map popup and permanent-tooltip formatting

Caller HTML is parsed into an inert template, never attached. Only passive structural/text elements are copied. Inline CSS is a property/value allowlist scoped to copied elements, with bounded dimensions. No style sheets/selectors, CSS variables, URLs, functions capable of resource retrieval, global positioning, scripts, event handlers, forms, embeds or image nodes are retained. Permanent tooltips use the same sanitizer as popups. Normal explicit safe links remain user-activated; rich formatting does not trigger external resource requests.
