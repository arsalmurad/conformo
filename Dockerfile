# Builds and serves packages/ui — the one app in this repo (CONTRIBUTING.md
# invariant 4: the app itself runs entirely client-side once loaded, with no
# server and no account). This container exists for "one command to try it,"
# not because the app needs a backend to function.
#
# Multi-stage: the builder needs Python (the `factur-x` pip package supplies
# the official Schematron XSLT source that gets compiled to SaxonJS SEF — see
# tools/compile-schematron.sh) and Node (everything else). The runtime image
# is a plain static file server with neither, so the shipped image doesn't
# carry a Python interpreter or the ~450 MB of node_modules nobody will ever
# invoke again after the build.

FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
RUN pip install --no-cache-dir factur-x pikepdf lxml saxonche

WORKDIR /repo
# package*.json (root + every workspace) copied first so `npm ci` is cached
# independently of source changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/formats/package.json packages/formats/package.json
COPY packages/pdf/package.json packages/pdf/package.json
COPY packages/validate/package.json packages/validate/package.json
COPY packages/parse/package.json packages/parse/package.json
COPY packages/compliance-data/package.json packages/compliance-data/package.json
COPY packages/docs-site/package.json packages/docs-site/package.json
COPY packages/validator-page/package.json packages/validator-page/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
RUN npm run schematron:compile
RUN npm run saxonjs:fetch
RUN npm run build --workspace=packages/ui

# A static file server with nothing else in the image: no Python, no
# node_modules, no source — just the production build.
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/ui/dist /usr/share/nginx/html
EXPOSE 80
