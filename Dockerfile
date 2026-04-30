# Stage 1: build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_SUPABASE_BUCKET

# Make public env vars available at build time so SvelteKit's
# $env/static/public can inline them during the client build.
ENV PUBLIC_SUPABASE_URL=${PUBLIC_SUPABASE_URL}
ENV PUBLIC_SUPABASE_ANON_KEY=${PUBLIC_SUPABASE_ANON_KEY}
ENV PUBLIC_SUPABASE_BUCKET=${PUBLIC_SUPABASE_BUCKET}

RUN pnpm build

# Stage 2: runtime
# note: 1 low-severity CVE remains in the node:22-alpine base image — it is
# tracked upstream and cannot be fixed in this Dockerfile.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3000
CMD ["node", "build"]
