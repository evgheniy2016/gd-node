FROM node:carbon
RUN mkdir /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN apt-get update
RUN apt-get install mysql-client -y
RUN ./node_modules/.bin/webpack
RUN chmod +x entrypoint.sh
ENTRYPOINT [ "./entrypoint.sh" ]
CMD ["npm", "start"]
EXPOSE 5001
