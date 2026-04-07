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

// Castle walls for collision detection
const walls = [
  // North wall left: x -15 to -5, z -15.5 to -14.5
  { minX: -15, maxX: -5, minZ: -15.5, maxZ: -14.5 },
  // North wall right: x 5 to 15, z -15.5 to -14.5
  { minX: 5, maxX: 15, minZ: -15.5, maxZ: -14.5 },
  // South wall: x -15 to 15, z 14.5 to 15.5
  { minX: -15, maxX: 15, minZ: 14.5, maxZ: 15.5 },
  // East wall: x 14.5 to 15.5, z -15 to 15
  { minX: 14.5, maxX: 15.5, minZ: -15, maxZ: 15 },
  // West wall: x -15.5 to -14.5, z -15 to 15
  { minX: -15.5, maxX: -14.5, minZ: -15, maxZ: 15 },
  // Central keep: x -4 to 4, z -4 to 4
  { minX: -4, maxX: 4, minZ: -4, maxZ: 4 }
];

// Function to check collision with walls
function checkCollision(x, z) {
  for (const wall of walls) {
    if (x >= wall.minX && x <= wall.maxX && z >= wall.minZ && z <= wall.maxZ) {
      return true;
    }
  }
  return false;
}

// Function to check if point is inside castle bounds
function isInsideCastle(x, z) {
  return x >= -15 && x <= 15 && z >= -15 && z <= 15;
}

// Initialize collectibles (gold coins)
for (let i = 0; i < 20; i++) {
  let x, z;
  do {
    x = Math.random() * 40 - 20;
    z = Math.random() * 40 - 20;
  } while (checkCollision(x, z) || isInsideCastle(x, z));
  collectibles.push({
    id: i,
    x: x,
    y: 1,
    z: z,
    type: 'gold'
  });
}

// Initialize weapons
for (let i = 0; i < 10; i++) {
  let x, z;
  do {
    x = Math.random() * 40 - 20;
    z = Math.random() * 40 - 20;
  } while (checkCollision(x, z) || isInsideCastle(x, z));
  weapons.push({
    id: i,
    x: x,
    y: 1,
    z: z,
    type: i % 2 === 0 ? 'sword' : 'axe'
  });
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new player at fixed spawn point outside castle
  const x = 20;
  const z = 0;

  players[socket.id] = {
    id: socket.id,
    x: x,
    y: 0,
    z: z,
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
      // Check for collision with castle walls
      if (!checkCollision(data.x, data.z)) {
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

  // Handle attacks (fist or weapon)
  socket.on('attack', (targetId) => {
    if (players[socket.id] && players[targetId]) {
      const damage = players[socket.id].equippedWeapon ? 20 : 5; // Weapons do 20, fists do 5
      players[targetId].health -= damage;
      if (players[targetId].health < 0) players[targetId].health = 0;

      io.emit('playerAttacked', {
        attackerId: socket.id,
        targetId,
        newHealth: players[targetId].health
      });

      // Handle player death and respawn
      if (players[targetId].health <= 0) {
        // Respawn at fixed location outside castle
        players[targetId].x = 20;
        players[targetId].y = 0;
        players[targetId].z = 0;
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