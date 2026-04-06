const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static('public'));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const players = {};
const collectibles = [];
const weapons = [];

// Initialize collectibles (gold coins)
for (let i = 0; i < 20; i++) {
  collectibles.push({
    id: i,
    x: Math.random() * 40 - 20,
    y: 1,
    z: Math.random() * 40 - 20,
    type: 'gold'
  });
}

// Initialize weapons
for (let i = 0; i < 10; i++) {
  weapons.push({
    id: i,
    x: Math.random() * 40 - 20,
    y: 1,
    z: Math.random() * 40 - 20,
    type: i % 2 === 0 ? 'sword' : 'axe'
  });
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 10 - 5,
    y: 0,
    z: Math.random() * 10 - 5,
    rotation: 0,
    health: 100,
    gold: 0,
    inventory: [],
    equippedWeapon: null
  };

  // Send initial game state
  socket.emit('initGame', {
    players,
    collectibles,
    weapons,
    yourId: socket.id
  });

  // Notify other players
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Handle player movement
  socket.on('playerMovement', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].rotation = data.rotation;

      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: data.x,
        y: data.y,
        z: data.z,
        rotation: data.rotation
      });
    }
  });

  // Handle gold collection
  socket.on('collectGold', (collectibleId) => {
    const collectible = collectibles.find(c => c.id === collectibleId);
    if (collectible && players[socket.id]) {
      players[socket.id].gold += 1;
      collectibles.splice(collectibles.findIndex(c => c.id === collectibleId), 1);

      io.emit('goldCollected', {
        playerId: socket.id,
        collectibleId,
        newGold: players[socket.id].gold
      });
    }
  });

  // Handle weapon pickup
  socket.on('pickupWeapon', (weaponId) => {
    const weapon = weapons.find(w => w.id === weaponId);
    if (weapon && players[socket.id] && players[socket.id].inventory.length < 5) {
      players[socket.id].inventory.push(weapon.type);
      weapons.splice(weapons.findIndex(w => w.id === weaponId), 1);

      io.emit('weaponPickedUp', {
        playerId: socket.id,
        weaponId,
        weaponType: weapon.type,
        inventory: players[socket.id].inventory
      });
    }
  });

  // Handle weapon equipping
  socket.on('equipWeapon', (slotIndex) => {
    if (players[socket.id] && players[socket.id].inventory[slotIndex]) {
      players[socket.id].equippedWeapon = players[socket.id].inventory[slotIndex];
      io.emit('weaponEquipped', {
        playerId: socket.id,
        weaponType: players[socket.id].equippedWeapon
      });
    }
  });

  // Handle attacks
  socket.on('attack', (targetId) => {
    if (players[socket.id] && players[targetId] && players[socket.id].equippedWeapon) {
      players[targetId].health -= 20;
      if (players[targetId].health < 0) players[targetId].health = 0;

      io.emit('playerAttacked', {
        attackerId: socket.id,
        targetId,
        newHealth: players[targetId].health
      });

      // Handle player death and respawn
      if (players[targetId].health <= 0) {
        players[targetId].x = Math.random() * 10 - 5;
        players[targetId].y = 0;
        players[targetId].z = Math.random() * 10 - 5;
        players[targetId].health = 100;

        io.emit('playerRespawned', {
          playerId: targetId,
          x: players[targetId].x,
          y: players[targetId].y,
          z: players[targetId].z
        });
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3010;
server.listen(PORT, () => {
  console.log(`Medieval multiplayer game server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});