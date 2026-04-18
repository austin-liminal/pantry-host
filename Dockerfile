# Stage 1: Build
FROM node:22-trixie-slim AS build

# Target architecture (amd64|arm64) — populated automatically by buildx.
ARG TARGETARCH

RUN apt-get update && apt-get install -y libssl3t64 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/
COPY packages/shared/package.json packages/shared/
COPY packages/marketing/package.json packages/marketing/
COPY packages/web/package.json packages/web/
COPY packages/mcp/package.json packages/mcp/
RUN npm ci

# Copy source
COPY packages/app packages/app
COPY packages/shared packages/shared

# Rex needs React symlinked into packages/app/node_modules
RUN cd packages/app && mkdir -p node_modules && \
    ln -sf ../../../node_modules/react node_modules/react && \
    ln -sf ../../../node_modules/react-dom node_modules/react-dom

# Rex + sharp ship platform-specific native binaries as optional deps.
# npm ci sometimes skips the linux variant during cross-platform buildx
# (e.g. building linux/amd64 on an arm64 Mac under qemu) because it
# inspects the host lockfile / environment rather than the target. Force
# the correct linux binary for the buildx target arch before building.
RUN REX_PKG="@limlabs/rex-linux-$(case "$TARGETARCH" in amd64) echo x64 ;; arm64) echo arm64 ;; *) echo "$TARGETARCH" ;; esac)" && \
    npm install "$REX_PKG" && \
    npm install --os=linux --cpu="$(case "$TARGETARCH" in amd64) echo x64 ;; arm64) echo arm64 ;; *) echo "$TARGETARCH" ;; esac)" sharp

# Build Rex for production
RUN npx @limlabs/rex build --root packages/app

# Stage 2: Runtime
FROM node:22-trixie-slim

RUN apt-get update && apt-get install -y libssl3t64 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app from build stage
COPY --from=build /app /app

# Create uploads directory
RUN mkdir -p packages/app/public/uploads

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000 4001

ENTRYPOINT ["/docker-entrypoint.sh"]
