FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
RUN mkdir -p /data /run/bridge-secrets && chown node:node /data /run/bridge-secrets
USER node
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node", "src/server.mjs"]
