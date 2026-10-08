# Use Node 20 as required by your package.json engines field
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package*.json ./

# The postinstall step applies the small Baileys decrypt fix, so its files
# must exist before `npm install` runs.
COPY scripts ./scripts
COPY patches ./patches

# Install only production dependencies
# Using npm install instead of npm ci to resolve Linux-specific binaries
RUN npm install --omit=dev

# Copy the rest of your bot code
COPY . .

# Create directories for persistent data (session, state, vault)
RUN mkdir -p /app/instances

# The WhatsApp login (session), settings and state live in instances/ — mount it as a volume
VOLUME ["/app/instances"]

# Start through the launcher: it resumes linked sessions, or pairs with
#   docker run ... al-jin node index.js --phone=923001234567
CMD ["node", "index.js"]
