import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GameManager } from './services/GameManager';
import { PokerServer, PokerRequest, PokerResponse } from './services/PokerServer';
import { randomUUID } from 'crypto';

// Create Express app
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Create game manager and MCP server
const gameManager = new GameManager();
const pokerServer = new PokerServer(gameManager);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// HTTP endpoint for MCP API
app.post('/api', (req, res) => {
  const request: PokerRequest = req.body;
  
  // Add ID if not provided
  if (!request.id) {
    request.id = randomUUID();
  }
  
  const response = pokerServer.handleRequest(request);
  res.json(response);
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('action', (request: PokerRequest, callback) => {
    // Add ID if not provided
    if (!request.id) {
      request.id = randomUUID();
    }
    
    const response = pokerServer.handleRequest(request);
    
    if (callback && typeof callback === 'function') {
      callback(response);
    }
  });
  
  // Handle table subscriptions
  socket.on('subscribe', (tableId: string) => {
    socket.join(`table:${tableId}`);
    console.log(`Client ${socket.id} subscribed to table ${tableId}`);
  });
  
  socket.on('unsubscribe', (tableId: string) => {
    socket.leave(`table:${tableId}`);
    console.log(`Client ${socket.id} unsubscribed from table ${tableId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Create some initial tables
gameManager.createTable('Beginner Table', 1, 2, 6);
gameManager.createTable('Intermediate Table', 5, 10, 9);
gameManager.createTable('Advanced Table', 10, 20, 6);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Function to broadcast table updates
export function broadcastTableUpdate(tableId: string): void {
  console.log(`Broadcasting table update for table ${tableId}`);
  const table = gameManager.getTable(tableId);
  if (table) {
    // Use the table's toJSON method instead of manually constructing the object
    io.to(`table:${tableId}`).emit('tableUpdate', table.toJSON());
  }
}

// Function to broadcast player actions
export function broadcastPlayerAction(tableId: string, playerId: string, action: string, amount: number = 0): void {
  console.log(`Broadcasting player action for table ${tableId}: ${playerId} ${action} ${amount}`);
  const table = gameManager.getTable(tableId);
  if (table) {
    const player = table.players.find(p => p.id === playerId);
    if (player) {
      const playerName = player.name;
      const actionMessage = formatActionMessage(playerName, action, amount);
      
      io.to(`table:${tableId}`).emit('playerAction', {
        playerId,
        playerName,
        action,
        amount,
        message: actionMessage,
        timestamp: Date.now()
      });
    }
  }
}

// Helper function to format action messages
function formatActionMessage(playerName: string, action: string, amount: number): string {
  switch(action.toLowerCase()) {
    case 'fold':
      return `${playerName} folded`;
    case 'check':
      return `${playerName} checked`;
    case 'call':
      return `${playerName} called`;
    case 'bet':
      return `${playerName} bet $${amount}`;
    case 'raise':
      return `${playerName} raised to $${amount}`;
    case 'all-in':
      return `${playerName} went ALL IN with $${amount}`;
    default:
      return `${playerName} performed ${action}`;
  }
}