import { randomUUID } from 'crypto';
import { Player } from '../models/Player';
import { Table } from '../models/Table';
import { BroadcastService } from './BroadcastService';

export class GameManager {
  private tables: Map<string, Table> = new Map();
  private playerTables: Map<string, string> = new Map(); // Maps player ID to table ID
  
  constructor() {}
  
  createTable(name: string, smallBlind: number = 5, bigBlind: number = 10, maxPlayers: number = 9): Table {
    const tableId = randomUUID();
    const table = new Table(tableId, name, smallBlind, bigBlind, maxPlayers);
    this.tables.set(tableId, table);
    return table;
  }
  
  getTable(tableId: string): Table | undefined {
    return this.tables.get(tableId);
  }
  
  getAllTables(): Table[] {
    return Array.from(this.tables.values());
  }
  
  joinTable(tableId: string, player: Player): boolean {
    const table = this.tables.get(tableId);
    if (!table) {
      return false;
    }
    
    // Check if player is already at a table
    if (this.playerTables.has(player.id)) {
      const currentTableId = this.playerTables.get(player.id);
      if (currentTableId === tableId) {
        return true; // Player is already at this table
      }
      
      // Leave current table first
      this.leaveTable(player.id);
    }
    
    const success = table.addPlayer(player);
    if (success) {
      this.playerTables.set(player.id, tableId);
    }
    
    return success;
  }
  
  leaveTable(playerId: string): boolean {
    const tableId = this.playerTables.get(playerId);
    if (!tableId) {
      return false;
    }
    
    const table = this.tables.get(tableId);
    if (!table) {
      this.playerTables.delete(playerId);
      return false;
    }
    
    const success = table.removePlayer(playerId);
    if (success) {
      this.playerTables.delete(playerId);
      
      // Comment out or remove this code that deletes empty tables
      // If table is empty, remove it
      // if (table.players.length === 0) {
      //   this.tables.delete(tableId);
      // }
    }
    
    return success;
  }
  
  getPlayerTable(playerId: string): Table | undefined {
    const tableId = this.playerTables.get(playerId);
    if (!tableId) {
      return undefined;
    }
    
    return this.tables.get(tableId);
  }
  
  performAction(playerId: string, action: string, amount: number = 0): boolean {
    const table = this.getPlayerTable(playerId);
    if (!table) {
      return false;
    }
    
    try {
      // Add error handling to get more information about failures
      const result = table.handlePlayerAction(playerId, action as any, amount);
      if (result) {
        BroadcastService.broadcastPlayerAction(table.id, playerId, action, amount);
      }
      return result;
    } catch (error) {
      console.error(`Error performing action ${action} for player ${playerId}:`, error);
      return false;
    }
  }
}