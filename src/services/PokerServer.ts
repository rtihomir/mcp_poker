import { Player, PlayerAction } from '../models/Player';
import { GameManager } from './GameManager';

export interface PokerRequest {
  method: string;
  params: any;
  id: string | number;
}

export interface PokerResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id: string | number;
}

export class PokerServer {
  private gameManager: GameManager;
  private players: Map<string, Player> = new Map();
  
  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
  }
  
  handleRequest(request: PokerRequest): PokerResponse {
    console.log(`[PokerServer] Received request: ${JSON.stringify(request)}`);
    
    try {
      const { method, params, id } = request;
      
      switch (method) {
        case 'register':
          return this.logResponse(this.handleRegister(params, id));
        
        case 'createTable':
          return this.logResponse(this.handleCreateTable(params, id));
        
        case 'listTables':
          return this.logResponse(this.handleListTables(params, id));
        
        case 'joinTable':
          return this.logResponse(this.handleJoinTable(params, id));
        
        case 'leaveTable':
          return this.logResponse(this.handleLeaveTable(params, id));
        
        case 'getTableState':
          return this.logResponse(this.handleGetTableState(params, id));
        
        case 'performAction':
          return this.logResponse(this.handlePerformAction(params, id));
        
        default:
          return this.logResponse({
            error: {
              code: -32601,
              message: `Method '${method}' not found`
            },
            id
          });
      }
    } catch (error) {
      const response = {
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        },
        id: request.id
      };
      console.error(`[PokerServer] Error processing request: ${error}`);
      return this.logResponse(response);
    }
  }
  
  // Helper method to log responses
  private logResponse(response: PokerResponse): PokerResponse {
    // For large responses (like table state), we might want to limit what we log
    const logSafeResponse = { ...response };
    if (logSafeResponse.result && typeof logSafeResponse.result === 'object') {
      // Truncate large result objects for logging
      logSafeResponse.result = '(Result object - see full response for details)';
    }
    
    console.log(`[PokerServer] Sending response: ${JSON.stringify(logSafeResponse)}`);
    return response;
  }
  
  private handleRegister(params: any, id: string | number): PokerResponse {
    const { name, chips } = params;
    
    if (!name) {
      return {
        error: {
          code: -32602,
          message: 'Invalid params: name is required'
        },
        id
      };
    }
    
    // Check if a player with this name already exists
    let existingPlayer: Player | undefined;
    for (const player of this.players.values()) {
      if (player.name === name) {
        existingPlayer = player;
        break;
      }
    }
    
    if (existingPlayer) {
      // Return the existing player instead of creating a new one
      console.log(`Player with name ${name} already exists, returning existing player`);
      return {
        result: {
          playerId: existingPlayer.id,
          name: existingPlayer.name,
          chips: existingPlayer.chips
        },
        id
      };
    }
    
    // Create a new player if no existing player was found
    const playerId = `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const initialChips = chips || 1000;
    
    const player = new Player(playerId, name, initialChips);
    this.players.set(playerId, player);
    
    return {
      result: {
        playerId,
        name,
        chips: initialChips
      },
      id
    };
  }
  
  private handleCreateTable(params: any, id: string | number): PokerResponse {
    const { name, smallBlind, bigBlind, maxPlayers } = params;
    
    if (!name) {
      return {
        error: {
          code: -32602,
          message: 'Invalid params: name is required'
        },
        id
      };
    }
    
    const table = this.gameManager.createTable(
      name,
      smallBlind || 5,
      bigBlind || 10,
      maxPlayers || 9
    );
    
    return {
      result: {
        tableId: table.id,
        name: table.name,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        maxPlayers: table.maxPlayers
      },
      id
    };
  }
  
  private handleListTables(params: any, id: string | number): PokerResponse {
    const tables = this.gameManager.getAllTables();
    
    return {
      result: tables.map(table => ({
        id: table.id,
        name: table.name,
        players: table.players.length,
        maxPlayers: table.maxPlayers,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        stage: table.stage
      })),
      id
    };
  }
  
  private handleJoinTable(params: any, id: string | number): PokerResponse {
    const { playerId, tableId } = params;
    
    if (!playerId || !tableId) {
      return {
        error: {
          code: -32602,
          message: 'Invalid params: playerId and tableId are required'
        },
        id
      };
    }
    
    const player = this.players.get(playerId);
    if (!player) {
      return {
        error: {
          code: -32602,
          message: `Player with ID ${playerId} not found`
        },
        id
      };
    }
    
    const success = this.gameManager.joinTable(tableId, player);
    if (!success) {
      return {
        error: {
          code: -32603,
          message: `Failed to join table ${tableId}`
        },
        id
      };
    }
    
    return {
      result: {
        success: true,
        tableId,
        playerId
      },
      id
    };
  }
  
  private handleLeaveTable(params: any, id: string | number): PokerResponse {
    const { playerId } = params;
    
    if (!playerId) {
      return {
        error: {
          code: -32602,
          message: 'Invalid params: playerId is required'
        },
        id
      };
    }
    
    const success = this.gameManager.leaveTable(playerId);
    
    return {
      result: {
        success
      },
      id
    };
  }
  
  private handleGetTableState(params: any, id: string | number): PokerResponse {
    const { tableId, playerId } = params;
    
    if (!tableId) {
      return {
        error: {
          code: -32602,
          message: 'Invalid params: tableId is required'
        },
        id
      };
    }
    
    const table = this.gameManager.getTable(tableId);
    if (!table) {
      return {
        error: {
          code: -32602,
          message: `Table with ID ${tableId} not found`
        },
        id
      };
    }
    
    // Create a view of the table state
    // If playerId is provided, include the player's cards
    const tableState = {
      id: table.id,
      name: table.name,
      stage: table.stage,
      pot: table.pot,
      currentBet: table.currentBet,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
      communityCards: table.communityCards.map(card => card.toString()),
      players: table.players.map(p => {
        const playerView = {
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
          hand: p.id === playerId ? p.hand.map(card => card.toString()) : []
        };
        return playerView;
      }),
      currentPlayerIndex: table.currentPlayerIndex
    };
    
    return {
      result: tableState,
      id
    };
  }
  
  private handlePerformAction(params: any, id: string | number): PokerResponse {
    const { playerId, action, amount } = params;
    
    if (!playerId || !action) {
      return {
        error: {
          code: -32602,
          message: 'Invalid params: playerId and action are required'
        },
        id
      };
    }
    
    // Validate action
    const validActions = Object.values(PlayerAction);
    if (!validActions.includes(action as PlayerAction)) {
      return {
        error: {
          code: -32602,
          message: `Invalid action: ${action}. Valid actions are: ${validActions.join(', ')}`
        },
        id
      };
    }
    
    const success = this.gameManager.performAction(playerId, action, amount || 0);
    if (!success) {
      return {
        error: {
          code: -32603,
          message: 'Failed to perform action'
        },
        id
      };
    }
    
    // Get updated table state
    const table = this.gameManager.getPlayerTable(playerId);
    
    return {
      result: {
        success: true,
        tableState: table ? table.toJSON(): null
      },
      id
    };
  }
}