FROM node:18-buster-slim
ENV config_dir=/config
RUN mkdir -p /usr/src/app && mkdir /config
WORKDIR /usr/src/app

COPY package.json /usr/src/app
COPY .snyk /usr/src/app
RUN npm install

COPY default_settings.js /usr/src/app
COPY index.js /usr/src/app
CMD npm start