const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Add new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 10 - 5,
    y: 0,
    z: Math.random() * 10 - 5,
    rotation: 0,
    username: '',
    health: 100,
    weapon: null
  };

  // Send current players to new player
  socket.emit('currentPlayers', players);

  // Broadcast new player to others
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('setUsername', (username) => {
    if (players[socket.id]) {
      players[socket.id].username = username;
    }
  });

  socket.on('attack', (targetId, damage) => {
    if (players[targetId]) {
      players[targetId].health -= damage;
      if (players[targetId].health < 0) players[targetId].health = 0;
      io.emit('playerDamaged', targetId, players[targetId].health);
    }
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].z = movementData.z;
      players[socket.id].rotation = movementData.rotation;

      // Broadcast to other players
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});