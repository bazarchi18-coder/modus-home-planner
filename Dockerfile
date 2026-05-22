# Use lightweight Node 18 Alpine image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy rest of the application files
COPY . .

# Expose server port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run start script
CMD ["npm", "start"]
