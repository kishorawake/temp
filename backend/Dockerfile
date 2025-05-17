# Stage 1: Build dependencies with native bindings
FROM node:18-alpine AS builder

# Install native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install --production

# Copy rest of the app
COPY . .

# Stage 2: Minimal production image
FROM node:18-alpine

# Install runtime dependency for SQLite (not g++, make, etc.)
RUN apk add --no-cache sqlite

WORKDIR /app


# Copy compiled node_modules and source code
COPY --from=builder /app .

EXPOSE 3000

CMD ["node", "server.js"]
