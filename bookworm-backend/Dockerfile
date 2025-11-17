# ---- Stage 1: Build ----
# Use a Node.js image that includes build tools
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies, including devDependencies for building
RUN npm install

# Copy the rest of the application source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the TypeScript code
RUN npm run build

# Prune devDependencies for a smaller node_modules in the next stage
RUN npm prune --production


# ---- Stage 2: Production ----
# Use a lightweight Node.js image for the final image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy pruned node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the compiled JavaScript code from the builder stage
COPY --from=builder /app/dist ./dist

# Copy Prisma schema for runtime
COPY --from=builder /app/prisma ./prisma

# Copy the public directory for the admin panel
COPY --from=builder /app/public ./public

# Expose the port the app runs on
EXPOSE 8080

# The command to run the application
# Note: We run the compiled JS file, not the TS source
CMD ["node", "dist/index.js"]
