# MCP server image (used by directories such as Glama to verify the server starts).
#   docker build -t makevideo . && docker run -i --rm -v "$PWD:/work" -w /work makevideo
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENTRYPOINT ["node", "/app/bin/makevideo.js"]
CMD ["mcp"]
