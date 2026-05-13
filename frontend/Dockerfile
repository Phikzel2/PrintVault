FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install

# Generate PWA icons from the SVG source (needs @resvg/resvg-js)
RUN npm install @resvg/resvg-js --no-save
COPY scripts/ ./scripts/
COPY public/ ./public/
RUN node scripts/generate-icons.mjs

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
