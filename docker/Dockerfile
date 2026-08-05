# Multi-stage build: shared + client + server
FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/

# Do not use --ignore-scripts: bcrypt and other native modules must compile on Alpine.
RUN npm ci || npm install

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client
COPY packages/server ./packages/server

RUN npm run db:generate --workspace=@roads-tour/server
RUN npm run build
RUN npm rebuild bcrypt --build-from-source
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache openssl

# Prisma CLI for `migrate deploy` at container start
RUN npm install -g prisma@6.3.1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/client/dist ./packages/client/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV CLIENT_DIST=../../client/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok){console.error('health HTTP',r.status);process.exit(1)}process.exit(0)}).catch(e=>{console.error('health check failed:',e.message);process.exit(1)})"

ENTRYPOINT ["/entrypoint.sh"]
