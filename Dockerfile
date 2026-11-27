FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY build ./build
COPY client ./client
COPY src/modules/site-themes/site-theme-presentation.* src/modules/site-themes/site-theme-storefront-effects.* ./src/modules/site-themes/
COPY src/modules/popup-banners/zero-block ./src/modules/popup-banners/zero-block
RUN npm run build

FROM node:24-alpine AS runtime
ARG APP_BUILD_SHA=development
ENV NODE_ENV=production
ENV APP_BUILD_SHA=$APP_BUILD_SHA
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app

LABEL org.opencontainers.image.revision=$APP_BUILD_SHA

RUN apk add --no-cache chromium ca-certificates curl freetype harfbuzz nss ttf-freefont \
  && addgroup -S nodeapp \
  && adduser -S nodeapp -G nodeapp \
  && mkdir -p /app/storage/catalog-media /app/storage/telegram-backup-transfer /app/storage/telegram-bot-api-config \
  && chown -R nodeapp:nodeapp /app/storage
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY --from=build /app/dist ./dist

USER nodeapp
EXPOSE 3000
CMD ["node", "src/server.js"]
