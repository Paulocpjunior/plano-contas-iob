FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
EXPOSE 8080
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1536"
CMD ["node", "server.js"]
