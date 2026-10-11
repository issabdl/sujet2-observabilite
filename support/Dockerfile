# Etape 1 : installation des dependances de production uniquement
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Etape 2 : image finale minimale
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

# npm n'est pas utile a l'execution, on le retire pour reduire la surface d'attaque
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# dossier de logs accessible a l'utilisateur non root
RUN mkdir -p logs && chown node:node logs

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "src/server.js"]
