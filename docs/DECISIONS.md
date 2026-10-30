# Decisions

One line of reasoning each, newest last.

- Work in `/home/user/arsalmurad/conformo` cloned read-only (shallow). Push access was declined by the harness and the brief says never push; commits stay local on `upgrade/v0.2`.
- Fetch official corpora with `git clone --depth 1` + tag pin, because GitHub zip/API hosts are blocked here but the git lane works; pins are by commit SHA and recorded in the manifest.
- SchXslt2 is also pinned from Maven Central (hash differs from the Codeberg zip because it is a different build of the same release) since Codeberg is unreachable from some environments; Maven Central publishes its own .sha256 for verification.
