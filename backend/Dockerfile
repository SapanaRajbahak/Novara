FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run prisma:generate

EXPOSE 5001

CMD ["npm", "run", "start:docker"]