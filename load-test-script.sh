#!/bin/bash
export $(cat .env | xargs)

node createRoom.js &
ROOM_PID=$!
sleep 1
npx artillery run --output report.json camon-scenario.yml
sleep 1
npx artillery report report.json
sleep 2
kill -9 $ROOM_PID