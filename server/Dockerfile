# ===============================
# Base image
# ===============================
FROM oven/bun:1.4.2 AS server
WORKDIR /app

# Copy package definitions and install all deps
# (devDependencies needed for mikro-orm CLI)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and static files
COPY src ./src
COPY public ./public

EXPOSE 3001

CMD ["bun", "src/server.ts"]

FROM server AS browser
COPY --from=game_client /bymr-local.swf /tmp/bymr-local.swf
RUN bun run web:prepare /tmp/bymr-local.swf && rm /tmp/bymr-local.swf

FROM server AS default
