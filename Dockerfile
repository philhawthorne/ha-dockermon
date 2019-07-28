FROM node:9.4.0
ENV config_dir=/config
RUN mkdir -p /usr/src/app && mkdir /config
WORKDIR /usr/src/app

COPY package.json /usr/src/app
COPY .snyk /usr/src/app
RUN npm install

COPY default_settings.json /usr/src/app
COPY index.js /usr/src/app
CMD npm start