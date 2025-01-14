const counter = {value: 0};

function createRoom(context, events, done) {
    const roomId = context.vars.roomId;
    const socket = context.sockets[''];

    if (counter.value === 0) {
        socket.emit('createRoom', {roomId});

        console.log('Creating room...', roomId);

        counter.value++;
        return done();
    }

    console.log('Skipping room creation for counter:', counter.value);
    counter.value++;
    return done();
}

export { createRoom };