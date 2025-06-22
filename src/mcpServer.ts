import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  ImageContent,
  TextContent
} from "@modelcontextprotocol/sdk/types.js";
import { io } from "socket.io-client"

// Configure socket.io client with logging disabled
const socket = io('http://localhost:3000', {});

const server = new Server(
  {
    name: "poker-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "login",
        description: "login and list all tables in the poker game",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ['name'],
        },
      },
      {
        name: "join_table",
        description: "Join a poker table",
        inputSchema: {
          type: "object",
          properties: {
            player_id: { type: "string" },
            table_id: { type: "string" },
          },
          required: ["player_id", "table_id"],
        },
      },
      {
        name: "get_table_status",
        description: "Get the current status of a poker table",
        inputSchema: {
          type: "object",
          properties: {
            player_id: { type: "string" },
            table_id: { type: "string" },
          },
          required: ["player_id", "table_id"],
        },
      },
      {
        name: "get_learning_table_status",
        description: "Get table status with ALL player cards visible (for learning/mentoring)",
        inputSchema: {
          type: "object",
          properties: {
            table_id: { type: "string" },
          },
          required: ["table_id"],
        },
      },
      {
        name: "leave_table",
        description: "Leave a poker table",
        inputSchema: {
            type: "object",
            properties: {
              player_id: { type: "string" },
              table_id: { type: "string" },
            },
            required: ["player_id", "table_id"],
        },
      },
      {
        name: "action_check",
        description: "do action check",
        inputSchema: {
            type: "object",
            properties: {
              player_id: { type: "string" },
              table_id: { type: "string" },
            },
            required: ["player_id", "table_id"],
        },
      },
      {
        name: "action_fold",
        description: "do action fold",
        inputSchema: {
            type: "object",
            properties: {
              player_id: { type: "string" },
              table_id: { type: "string" },
            },
            required: ["player_id", "table_id"],
        },
      },
      {
        name: "action_bet",
        description: "do action bet",
        inputSchema: {
          type: "object",
          properties: {
            player_id: { type: "string" },
            table_id: { type: "string" },
            amount: { type: "number" },
          },
          required: ["player_id", "table_id", 'amount'],
        },
      },
      {
        name: "action_raise",
        description: "do action raise",
        inputSchema: {
          type: "object",
          properties: {
            player_id: { type: "string" },
            table_id: { type: "string" },
            amount: { type: "number" },
          },
          required: ["player_id", "table_id", 'amount'],
        },
      },
      {
        name: "action_call",
        description: "do action call",
        inputSchema: {
            type: "object",
            properties: {
              player_id: { type: "string" },
              table_id: { type: "string" },
            },
            required: ["player_id", "table_id"],
        },
      },
    ],
  };
});

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// FIXED: Simple function to get table state once without aggressive polling
async function getTableStateOnce(player_id: unknown, table_id: unknown): Promise<string> {
    try {
        const tableState = await sendPokerRequest('getTableState', {
            playerId: player_id,
            tableId: table_id
        });
        return formatTableState(tableState);
    } catch (error) {
        console.error('Error getting table state:', error);
        return 'Error getting table state';
    }
}

// FIXED: Wait for player turn only when needed (for actions), with shorter timeout
async function waitForPlayerTurn(player_id: unknown, table_id: unknown, maxWaitSeconds = 10): Promise<string> {
    let counter = 0;
    while (counter < maxWaitSeconds) {
        try {
            const tableState = await sendPokerRequest('getTableState', {
                playerId: player_id,
                tableId: table_id
            });
            
            const currentPlayer = tableState.players.find((p: any) => p.isActive);
            if (currentPlayer && currentPlayer.id === player_id) {
                return formatTableState(tableState);
            }
            
            await sleep(1000);
            counter++;
        } catch (error) {
            console.error('Error waiting for player turn:', error);
            break;
        }
    }
    
    // Return current state even if not player's turn
    return await getTableStateOnce(player_id, table_id);
}

function sendPokerRequest(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      params,
      id: Date.now()
    };
    
    socket.emit('action', request, (response: any) => {
      if (response.error) {
        console.error(`[Client] Error in ${method}:`, response.error);
        reject(response.error);
      } else {
        resolve(response.result);
      }
    });
  });
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments;
  let response = null;
  let view_text = '';
  
  try {
    if (request.params.name === "login") {
      response = await sendPokerRequest('register', { name: args?.name });
      view_text = `Logged in as ${args?.name}.\n Your PlayerID: ${response.playerId}.\n Available tables:\n`;
      
      // After login, fetch tables
      const tables = await sendPokerRequest('listTables', {});
      if (tables && tables.length > 0) {
        tables.forEach((table: any, index: number) => {
          view_text += `Table: ${table.name} - TableID: ${table.id} - Players: ${table.players}/${table.maxPlayers} - Blinds: $${table.smallBlind}/$${table.bigBlind}\n`;
        });
      } else {
        view_text += "No tables available. Create one to start playing.";
      }
    } 
    else if (request.params.name === "join_table") {
      response = await sendPokerRequest('joinTable', { 
        playerId: args?.player_id,
        tableId: args?.table_id
      });
      view_text = `Player ${args?.player_id} joined table ${args?.table_id}.\n Game state:\n`;
      
      // FIXED: Get table state after joining without aggressive polling
      view_text += await getTableStateOnce(args?.player_id, args?.table_id);
    } 
    else if (request.params.name === "get_table_status") {
      // Get the current state of the table
      const tableState = await sendPokerRequest('getTableState', {
        playerId: args?.player_id,
        tableId: args?.table_id
      });
      
      view_text = `Current status for table ${args?.table_id}:\n`;
      view_text += formatTableState(tableState);
    }
    else if (request.params.name === "get_learning_table_status") {
      // NEW: Get learning table state with all cards visible
      const tableState = await sendPokerRequest('getLearningTableState', {
        tableId: args?.table_id
      });
      
      view_text = `Learning table status for ${args?.table_id} (ALL CARDS VISIBLE):\n`;
      view_text += formatTableState(tableState);
    }
    else if (request.params.name === "leave_table") {
      response = await sendPokerRequest('leaveTable', {
        playerId: args?.player_id,
        tableId: args?.table_id
      });
      view_text = `Player ${args?.player_id} left table ${args?.table_id}. Game state:\n`;
    } 
    else if (request.params.name === "action_check") {
      response = await sendPokerRequest('performAction', { 
        playerId: args?.player_id,
        tableId: args?.table_id,
        action: 'check' 
      });
      view_text = `Player ${args?.player_id} action: Check\n Game state:\n`;
      
      // FIXED: Wait briefly for next turn
      view_text += await waitForPlayerTurn(args?.player_id, args?.table_id, 5);
    } 
    else if (request.params.name === "action_fold") {
      response = await sendPokerRequest('performAction', { 
        playerId: args?.player_id,
        tableId: args?.table_id,
        action: 'fold' 
      });
      view_text = `Player ${args?.player_id} action: Fold\n Game state:\n`;
      
      // FIXED: Just get current state after fold (no need to wait for turn)
      view_text += await getTableStateOnce(args?.player_id, args?.table_id);
    } 
    else if (request.params.name === "action_bet") {
      response = await sendPokerRequest('performAction', { 
        playerId: args?.player_id,
        tableId: args?.table_id,
        action: 'bet',
        amount: args?.amount 
      });
      view_text = `Player ${args?.player_id} action: Bet $${args?.amount}\n Game state:\n`;
      
      // FIXED: Wait briefly for next turn
      view_text += await waitForPlayerTurn(args?.player_id, args?.table_id, 5);
    } 
    else if (request.params.name === "action_raise") {
      response = await sendPokerRequest('performAction', { 
        playerId: args?.player_id,
        tableId: args?.table_id,
        action: 'raise',
        amount: args?.amount 
      });
      view_text = `Player ${args?.player_id} action: Raise to $${args?.amount}\n Game state:\n`;
      
      // FIXED: Wait briefly for next turn
      view_text += await waitForPlayerTurn(args?.player_id, args?.table_id, 5);
    } 
    else if (request.params.name === "action_call") {
      response = await sendPokerRequest('performAction', { 
        playerId: args?.player_id,
        tableId: args?.table_id,
        action: 'call' 
      });
      view_text = `Player ${args?.player_id} action: Call\n Game state:\n`;
      
      // FIXED: Wait briefly for next turn
      view_text += await waitForPlayerTurn(args?.player_id, args?.table_id, 5);
    } 
    else {
      throw new McpError(ErrorCode.InternalError, "Tool not found");
    }
  } catch (error: any) {
    console.error("Error handling tool request:", error);
    view_text = `Error: ${error.message || "Unknown error occurred"}`;
    
    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: view_text,
      } as TextContent,
    ],
    isError: false,
  };
});

// Helper function to format table state for display
function formatTableState(tableState: any): string {
  if (!tableState) return "No table state available.";
  
  let result = `Table: ${tableState.name} (ID: ${tableState.id})\n`;
  result += `Stage: ${tableState.stage}\n`;
  result += `Pot: $${tableState.pot}\n`;
  result += `Current Bet: $${tableState.currentBet}\n`;
  
  // Find the current active player
  const currentPlayer = tableState.players.find((p: any) => p.isActive);
  if (currentPlayer) {
    result += `Current Player: ${currentPlayer.name} (ID: ${currentPlayer.id})\n`;
  }
  
  // Community cards
  result += `Community Cards: ${tableState.communityCards.join(', ') || 'None'}\n\n`;
  
  // Players
  result += "Players:\n";
  tableState.players.forEach((player: any) => {
    result += `- ${player.name}: $${player.chips} chips`;
    
    if (player.isDealer) result += " (Dealer)";
    if (player.isSmallBlind) result += " (Small Blind)";
    if (player.isBigBlind) result += " (Big Blind)";
    if (player.isActive) result += " (Active)";
    if (player.folded) result += " (Folded)";
    if (player.isAllIn) result += " (All-In)";
    
    result += ` - Bet: $${player.bet}\n`;
    
    // Show hand if available
    if (player.hand && player.hand.length > 0) {
      result += `  Hand: ${player.hand.join(', ')}\n`;
    }
  });
  
  return result;
}

const transport = new StdioServerTransport();
server.connect(transport);