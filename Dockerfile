# Stage 1: Build
FROM node:22-trixie-slim AS build

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

# Rex uses platform-specific native binaries — npm ci only installs for the
# lockfile's platform. Force-install the linux/x64 binary and build.
RUN npm install @limlabs/rex-linux-x64 \
    && npx @limlabs/rex build --root packages/app

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
