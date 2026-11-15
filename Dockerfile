# Game server + web client in one small image. Works on any container host with WebSocket support
# (Railway, Fly.io, Koyeb, a VPS…).
#
#   docker build -t ultimate-auction-arena .
#   docker run -p 8787:8787 ultimate-auction-arena

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Only needed when the web client will be hosted somewhere other than this container.
ARG VITE_WS_URL=""
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
# The server bundle has no runtime dependencies: nothing to install here.
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
RUN mkdir -p server/data && chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "dist-server/index.mjs", "--prod"]
