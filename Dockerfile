FROM node:18-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm


# Copy source code
COPY . .



# Install dependencies
RUN pnpm install


# # Expose ports for dev server
# EXPOSE 3000 8080

# # Run dev command
# CMD ["pnpm", "dev"]
