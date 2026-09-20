# Security policy

## Reporting a vulnerability

Report privately through GitHub's "Report a vulnerability" button on the
Security tab. Do not open a public issue. Expect an acknowledgement within
72 hours.

## Scope

In scope: XML/PDF parsing and generation, XXE and entity expansion, path
traversal in attachment handling, XSS in rendered templates, anything that
causes a generated document to misrepresent its own contents.

Out of scope: findings that require a malicious local operator, and denial of
service through deliberately enormous input.

## Design commitments

- No invoice content is transmitted anywhere by the core or the web app.
- External entity resolution is disabled in every XML parser we ship.
- The repo contains no real bank details, client names or credentials, and
  fixtures are synthetic.
