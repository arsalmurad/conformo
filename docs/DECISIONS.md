# Decisions

One line of reasoning each, newest last.

- Work in `/home/user/arsalmurad/conformo` cloned read-only (shallow). Push access was declined by the harness and the brief says never push; commits stay local on `upgrade/v0.2`.
- Fetch official corpora with `git clone --depth 1` + tag pin, because GitHub zip/API hosts are blocked here but the git lane works; pins are by commit SHA and recorded in the manifest.
- SchXslt2 is pinned from Maven Central (hash 5251979...), verified against Maven's own published .sha256/.sha1; the earlier Codeberg pin is dropped because Codeberg is unreachable from some networks. (An interim hash I first noted was the body of a rate-limit page; the fetcher's checksum verification caught it, which is the point of pinning.)
- All third-party artefacts are declared once in `tools/artefacts.manifest.json` and fetched by `tools/fetch-artefacts.mjs` (Node, no Python), replacing `tools/fetch_artefacts.py` and the inline URLs in the compile script.
- Git artefacts are pinned by the commit a tag peels to and fetched via `refs/tags/<tag>` because some upstream repos have a branch with the same name as a tag.
