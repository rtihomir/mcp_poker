import { Server as SocketIOServer } from 'socket.io';
import { GameManager } from './GameManager.js';

export class BroadcastService {
  private static io: SocketIOServer | null = null;
  private static gameManager: GameManager | null = null;

  static initialize(io: SocketIOServer, gameManager: GameManager) {
    BroadcastService.io = io;
    BroadcastService.gameManager = gameManager;
  }

  static broadcastTableUpdate(tableId: string): void {
    console.log(`Broadcasting table update for table ${tableId}`);
    
    if (!BroadcastService.io || !BroadcastService.gameManager) {
      console.warn('BroadcastService not initialized properly');
      return;
    }

    const table = BroadcastService.gameManager.getTable(tableId);
    if (table) {
      // Use the table's toJSON method instead of manually constructing the object
      BroadcastService.io.to(`table:${tableId}`).emit('tableUpdate', table.toJSON());
    }
  }

  static broadcastPlayerAction(tableId: string, playerId: string, action: string, amount: number = 0): void {
    console.log(`Broadcasting player action for table ${tableId}: ${playerId} ${action} ${amount}`);
    
    if (!BroadcastService.io || !BroadcastService.gameManager) {
      console.warn('BroadcastService not initialized properly');
      return;
    }

    const table = BroadcastService.gameManager.getTable(tableId);
    if (table) {
      const player = table.players.find(p => p.id === playerId);
      if (player) {
        const playerName = player.name;
        const actionMessage = BroadcastService.formatActionMessage(playerName, action, amount);
        
        BroadcastService.io.to(`table:${tableId}`).emit('playerAction', {
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

  private static formatActionMessage(playerName: string, action: string, amount: number): string {
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
}
