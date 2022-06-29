# Gathering Storm

An application to help social scientists to collate and analyze social interactions during a Twitter storm

# Build and run

docker build -t gstorm:latest .

-- run
docker run --name gstorm-gather --restart=on-failure:10 -v C:\dev\gathering_storm\gathering-storm\data:/home/app/data gstorm:latest

-- run from linux server
docker run --name gstorm-gather --restart=on-failure:10 -v /home/root/dev/gathering-storm/data:/home/app/data gstorm:latest

# Copyright and license

Copyright (c) Susan Watson 2020-2022 All rights reserved
This software is published under the GNU GENERAL PUBLIC LICENSE version 3.
