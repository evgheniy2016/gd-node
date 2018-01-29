#!/bin/bash

set -e

cmd="$@"

until mysql -h "${MYSQL_HOST}" -u ${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE} -e 'select 1'; do
  >&2 echo "MySQL is unavailable - sleeping"
  sleep 1
done

>&2 echo "Mysql is up - checking web server"

while [[ `wget -S --spider "${BACKEND_URL}/installing.txt"  2>&1 | grep 'HTTP/1.1 200 OK'` ]]; do
  >&2 echo "Web server not ready - sleeping"
  sleep 1
done

exec $cmd