ARG NODEVERSION=12-alpine
FROM node:${NODEVERSION}

ENV HOME=/home

WORKDIR $HOME/app

COPY *.js $HOME/app/
COPY subjects.txt $HOME/app/
COPY corpus.txt $HOME/app/
COPY users_subjects.json $HOME/app/
COPY package.json $HOME/app/

RUN mkdir data

RUN pwd
RUN ls -la

RUN npm install --production

CMD ["node", "app.js"]



