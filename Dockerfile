# MCP server image (used by directories such as Glama to verify the server starts).
#   docker build -t makevideo . && docker run -i --rm -v "$PWD:/work" -w /work makevideo
FROM node:22-slim
LABEL io.modelcontextprotocol.server.name="io.github.random00000000/makevideo"       org.opencontainers.image.source="https://github.com/random00000000/makevideo"       org.opencontainers.image.description="makevideo MCP server: narrated, captioned MP4 videos from Markdown or JSON"       org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENTRYPOINT ["node", "/app/bin/makevideo.js"]
CMD ["mcp"]
