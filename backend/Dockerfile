FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run prisma:generate

EXPOSE 5002

CMD ["npm", "run", "start:docker"]