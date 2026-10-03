# Imagen de la aplicación (Node.js 22 sobre Alpine).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencias primero para aprovechar la caché de capas.
# Se instalan también las de desarrollo (jest, supertest) porque las pruebas se ejecutan dentro del contenedor.
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
COPY data ./data
# .gitignore se copia para que el control de calidad C4 pueda verificar que .env queda fuera de Git.
COPY .gitignore ./

# El Excel original queda de solo lectura dentro de la imagen.
RUN chmod 444 data/CatalogoServicios.xlsx && chown -R node:node /app/src /app/public /app/scripts /app/tests
USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1

CMD ["node", "scripts/iniciar.js"]
