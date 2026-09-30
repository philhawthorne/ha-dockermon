FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
CMD ["sh", "-c", "node --test test/*.test.js && node --test test/integration/*.test.js"]
