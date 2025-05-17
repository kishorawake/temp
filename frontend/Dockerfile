# Use a super lightweight Node base
FROM node:18-alpine

# Set working directory
WORKDIR /frontend

# Copy only required files
COPY . .

# Install live-server efficiently
RUN npm install -g live-server && npm cache clean --force

# Expose port
EXPOSE 3001

# Run live-server
CMD ["live-server", "--port=3001", "--host=0.0.0.0"]
