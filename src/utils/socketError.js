function emitSocketError(socket, type, message, data = {}) {
  socket.emit('socket_error', {
    type,
    message,
    ...data,
  });
}

module.exports = emitSocketError;