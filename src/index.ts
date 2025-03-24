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
    io.to(`table:${tableId}`).emit('tableUpdate', {
      id: table.id,
      name: table.name,
      stage: table.stage,
      pot: table.pot,
      currentBet: table.currentBet,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
      communityCards: table.communityCards.map(card => card.toString()),
      players: table.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        isAllIn: p.isAllIn,
        isDealer: p.isDealer,
        isSmallBlind: p.isSmallBlind,
        isBigBlind: p.isBigBlind,
        isActive: p.isActive,
        hand: p.hand ? p.hand.map(card => card.toString()) : undefined
      })),
      currentPlayerIndex: table.currentPlayerIndex
    });
  }
}