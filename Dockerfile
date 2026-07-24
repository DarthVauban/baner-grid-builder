FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY client ./client
RUN npm run build

FROM node:20-alpine AS runtime
ARG APP_BUILD_SHA=development
ENV NODE_ENV=production
ENV APP_BUILD_SHA=$APP_BUILD_SHA
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app

LABEL org.opencontainers.image.revision=$APP_BUILD_SHA

RUN apk add --no-cache chromium ca-certificates curl freetype harfbuzz nss ttf-freefont \
  && addgroup -S nodeapp \
  && adduser -S nodeapp -G nodeapp \
  && mkdir -p /app/storage/catalog-media \
  && chown -R nodeapp:nodeapp /app/storage
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY --from=build /app/dist ./dist

USER nodeapp
EXPOSE 3000
CMD ["node", "src/server.js"]
