import { randomUUID } from 'crypto';
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { BroadcastService } from './services/BroadcastService.js';
import { GameManager } from './services/GameManager.js';
import { PokerRequest, PokerServer } from './services/PokerServer.js';

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

// Initialize broadcast service after Socket.IO setup
BroadcastService.initialize(io, gameManager);

// Create some initial tables
gameManager.createTable('Beginner Table', 1, 2, 6);
gameManager.createTable('Intermediate Table', 5, 10, 9);
gameManager.createTable('Advanced Table', 10, 20, 6);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`HAND_DURATION configured to: ${process.env.HAND_DURATION || '120'} seconds`);
});

// Export functions for backward compatibility
export function broadcastTableUpdate(tableId: string): void {
  BroadcastService.broadcastTableUpdate(tableId);
}

export function broadcastPlayerAction(tableId: string, playerId: string, action: string, amount: number = 0): void {
  BroadcastService.broadcastPlayerAction(tableId, playerId, action, amount);
}