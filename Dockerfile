FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
COPY --from=client-build /client/dist ./public
USER node
EXPOSE 4008
CMD ["npm", "start"]
