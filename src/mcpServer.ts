import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  TextContent
} from "@modelcontextprotocol/sdk/types.js";
import { io } from "socket.io-client";
import { z } from 'zod';
import { logger, LogLevel } from "./services/FileLoger.js";

// Set logger to DEBUG level to capture all events
logger.setLogLevel(LogLevel.DEBUG);

// Configure socket.io client with robust connection settings
const socket = io('http://localhost:3000', {});

// Connect after a brief delay to ensure MCP server is ready
setTimeout(() => {
  socket.connect();
}, 100);

socket.on('connect', async () => {
  await logger.info(`MCP Server connected to poker server with socket ID: ${socket.id}`);
});

socket.on('disconnect', async (reason) => {
  await logger.warn(`MCP Server disconnected from poker server: ${reason}`);
});

socket.on('connect_error', async (error) => {
  await logger.error(`MCP Server connection error: ${error.message}`);
});

socket.on('tableUpdate', async (data) => {
  await logger.debug(`Table update received: ${JSON.stringify(data)}`);
});

socket.on('playerAction', async (data) => {
  await logger.debug(`Player action received: ${JSON.stringify(data)}`);
});

// Track subscribed tables
const subscribedTables = new Set<string>();

// Helper function to subscribe to table updates
async function subscribeToTable(tableId: string) {
  if (!subscribedTables.has(tableId)) {
    socket.emit('subscribe', tableId);
    subscribedTables.add(tableId);
    await logger.info(`MCP Server subscribed to table: ${tableId}`);
  }
}

const server = new McpServer(
  {
    name: "poker-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}
    },
  }
);

// Register all tools using the new API
server.tool("login", "login and list all tables in the poker game", {
  name: z.string().min(1, "Name is required"),
}, async ({ name }) => {
  try {
    const response = await sendPokerRequest('register', { name });
    let view_text = `Logged in as ${name}.\n Your PlayerID: ${response.playerId}.\n Available tables:\n`;
    
    // After login, fetch tables
    const tables = await sendPokerRequest('listTables', {});
    if (tables && tables.length > 0) {
      tables.forEach((table: any, index: number) => {
        view_text += `Table: ${table.name} - TableID: ${table.id} - Players: ${table.players}/${table.maxPlayers} - Blinds: $${table.smallBlind}/$${table.bigBlind}\n`;
      });
    } else {
      view_text += "No tables available. Create one to start playing.";
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
  } catch (error: any) {
    await logger.error(`Error handling login: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("join_table", "Join a poker table", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ player_id, table_id }) => {
  try {
    const response = await sendPokerRequest('joinTable', { 
      playerId: player_id,
      tableId: table_id
    });
    
    // Subscribe to table updates for this table
    if (table_id) {
      subscribeToTable(table_id as string);
    }
    
    let view_text = `Player ${player_id} joined table ${table_id}.\n Game state:\n`;
    
    // Get table state after joining without aggressive polling
    view_text += await getTableStateOnce(player_id, table_id);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling join_table: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("get_table_status", "Get the current status of a poker table", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ player_id, table_id }) => {
  try {
    // Subscribe to table updates for monitoring
    if (table_id) {
      subscribeToTable(table_id as string);
    }
    
    // Get the current state of the table
    const tableState = await sendPokerRequest('getTableState', {
      playerId: player_id,
      tableId: table_id
    });
    
    let view_text = `Current status for table ${table_id}:\n`;
    view_text += formatTableState(tableState);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling get_table_status: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("get_learning_table_status", "Get table status with ALL player cards visible (for learning/mentoring)", {
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ table_id }) => {
  try {
    // Subscribe to table updates for monitoring
    if (table_id) {
      subscribeToTable(table_id as string);
    }
    
    // Get learning table state with all cards visible
    const tableState = await sendPokerRequest('getLearningTableState', {
      tableId: table_id
    });
    
    let view_text = `Learning table status for ${table_id} (ALL CARDS VISIBLE):\n`;
    view_text += formatTableState(tableState);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling get_learning_table_status: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("leave_table", "Leave a poker table", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ player_id, table_id }) => {
  try {
    const response = await sendPokerRequest('leaveTable', {
      playerId: player_id,
      tableId: table_id
    });
    
    let view_text = `Player ${player_id} left table ${table_id}. Game state:\n`;

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling leave_table: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("action_check", "do action check", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ player_id, table_id }) => {
  try {
    const response = await sendPokerRequest('performAction', { 
      playerId: player_id,
      tableId: table_id,
      action: 'check' 
    });
    
    let view_text = `Player ${player_id} action: Check\n Game state:\n`;
    
    // Wait briefly for next turn
    view_text += await waitForPlayerTurn(player_id, table_id, 5);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling action_check: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("action_fold", "do action fold", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ player_id, table_id }) => {
  try {
    const response = await sendPokerRequest('performAction', { 
      playerId: player_id,
      tableId: table_id,
      action: 'fold' 
    });
    
    let view_text = `Player ${player_id} action: Fold\n Game state:\n`;
    
    // Just get current state after fold (no need to wait for turn)
    view_text += await getTableStateOnce(player_id, table_id);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling action_fold: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("action_bet", "do action bet", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
  amount: z.number().positive("Amount must be a positive number"),
}, async ({ player_id, table_id, amount }) => {
  try {
    const response = await sendPokerRequest('performAction', { 
      playerId: player_id,
      tableId: table_id,
      action: 'bet',
      amount: amount 
    });
    
    let view_text = `Player ${player_id} action: Bet $${amount}\n Game state:\n`;
    
    // Wait briefly for next turn
    view_text += await waitForPlayerTurn(player_id, table_id, 5);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling action_bet: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("action_raise", "do action raise", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
  amount: z.number().positive("Amount must be a positive number"),
}, async ({ player_id, table_id, amount }) => {
  try {
    const response = await sendPokerRequest('performAction', { 
      playerId: player_id,
      tableId: table_id,
      action: 'raise',
      amount: amount 
    });
    
    let view_text = `Player ${player_id} action: Raise to $${amount}\n Game state:\n`;
    
    // Wait briefly for next turn
    view_text += await waitForPlayerTurn(player_id, table_id, 5);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling action_raise: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

server.tool("action_call", "do action call", {
  player_id: z.string().min(1, "Player ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
}, async ({ player_id, table_id }) => {
  try {
    const response = await sendPokerRequest('performAction', { 
      playerId: player_id,
      tableId: table_id,
      action: 'call' 
    });
    
    let view_text = `Player ${player_id} action: Call\n Game state:\n`;
    
    // Wait briefly for next turn
    view_text += await waitForPlayerTurn(player_id, table_id, 5);

    return {
      content: [
        {
          type: "text",
          text: view_text,
        } as TextContent,
      ],
      isError: false,
    };
  } catch (error: any) {
    await logger.error(`Error handling action_call: ${error.message || "Unknown error occurred"}`);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
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
        await logger.error(`Error getting table state: ${error}`);
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
            await logger.error(`Error waiting for player turn: ${error}`);
            break;
        }
    }
    
    // Return current state even if not player's turn
    return await getTableStateOnce(player_id, table_id);
}

function sendPokerRequest(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // Check if socket is connected
    if (!socket.connected) {
      reject(new Error('Socket not connected to poker server'));
      return;
    }

    const request = {
      method,
      params,
      id: Date.now()
    };
    
    // Set a timeout for the request
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout for method: ${method}`));
    }, 15000); // 15 second timeout
    
    socket.emit('action', request, (response: any) => {
      clearTimeout(timeoutId);
      
      if (response && response.error) {
        logger.error(`Error in ${method}: ${JSON.stringify(response.error)}`);
        reject(response.error);
      } else if (response && response.result !== undefined) {
        resolve(response.result);
      } else {
        reject(new Error(`Invalid response for method: ${method}`));
      }
    });
  });
}

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

// Initialize MCP server with proper error handling
async function initializeMCPServer() {
  try {
    await logger.info('Starting MCP Server...');
    server.connect(transport);
    await logger.info('MCP Server successfully connected to transport');
  } catch (error: any) {
    await logger.error(`Failed to connect MCP server: ${error.message}`);
    process.exit(1);
  }
}

// Start the MCP server
initializeMCPServer().catch(async (error) => {
  await logger.error(`Failed to initialize MCP server: ${error.message}`);
  process.exit(1);
});