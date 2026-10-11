# Media-Proxy: public read-only gateway for the private Railway Bucket.
# Own code (server.ts), runs on the official Bun image with no extra packages.
FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY --chown=bun:bun server.ts ./
ENV NODE_ENV=production \
    PORT=8080
USER bun
EXPOSE 8080
CMD ["bun", "run", "server.ts"]
