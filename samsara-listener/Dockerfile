FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source
COPY . .

# Railway / production: run with tsx (no build step needed)
CMD ["npx", "tsx", "index.ts"]
