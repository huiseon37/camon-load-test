import dotenv from 'dotenv';
import { io } from 'socket.io-client';

dotenv.config();

const TARGET = process.env.TARGET;
const roomId = process.env.ROOM_ID;

async function createRoom() {
    return new Promise((resolve, reject) => {
        const socket = io(TARGET,{
            extraHeaders:{
                accessToken: `Bearer ${process.env.JWT_TOKEN}`
            }
        });

        socket.emit('createRoom', {roomId}, ({roomId})=>{
            console.log('createRoom by', socket.id, roomId);
            resolve({socket});
        });

        socket.on('exception', (err)=>{
            console.log(err);
            reject();
        });
    })
}

createRoom();

