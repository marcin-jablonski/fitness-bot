FROM node:13.12.0

COPY src /src/fitness

WORKDIR /src/fitness

RUN npm install

ENTRYPOINT ["node", "app.js"]