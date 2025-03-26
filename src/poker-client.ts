// First install socket.io-client: npm install socket.io-client @types/socket.io-client
// Remove the import and use the global io object
// import { io } from 'socket.io-client';

// Connect to the server
const socket = (window as any).io();

// Game state
interface Player {
  playerId: string;
  name: string;
}

interface TablePlayer {
  id: string;
  name: string;
  chips: number;
  bet: number;
  folded: boolean;
  isAllIn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActive: boolean;
  hand?: string[];
}

interface TableState {
  id: string;
  name: string;
  players: TablePlayer[];
  communityCards: string[];
  pot: number;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  stage: string;
  maxPlayers: number;
  remainingActionTime?: number; // Add this field to receive the timer from server
}

interface TableInfo {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  stage: string;
}

// Add interface for player action data
interface PlayerActionData {
  playerId: string;
  playerName: string;
  action: string;
  amount: number;
  message: string;
  timestamp: number;
}

let player: Player | null = null;
let currentTable: string | null = null;
let currentTableState: TableState | null = null;

// Add countdown timer variables
let countdownTimer: number | null = null;
let countdownValue: number = 0;

// Add countdown element reference
const countdownElement = document.createElement('div');
countdownElement.className = 'countdown-timer';
countdownElement.style.display = 'none';
document.body.appendChild(countdownElement);

// DOM elements
const container = document.getElementById('container') as HTMLDivElement;
const loginContainer = document.getElementById('loginContainer') as HTMLDivElement;
const tablesContainer = document.getElementById('tablesContainer') as HTMLDivElement;
const createTableContainer = document.getElementById('createTableContainer') as HTMLDivElement;
const gameContainer = document.getElementById('gameContainer') as HTMLDivElement;
const playerNameInput = document.getElementById('playerName') as HTMLInputElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const refreshTablesBtn = document.getElementById('refreshTablesBtn') as HTMLButtonElement;
const createTableBtn = document.getElementById('createTableBtn') as HTMLButtonElement;
const tableList = document.getElementById('tableList') as HTMLDivElement;
const tableNameInput = document.getElementById('tableName') as HTMLInputElement;
const smallBlindInput = document.getElementById('smallBlind') as HTMLInputElement;
const bigBlindInput = document.getElementById('bigBlind') as HTMLInputElement;
const maxPlayersInput = document.getElementById('maxPlayers') as HTMLInputElement;
const submitTableBtn = document.getElementById('submitTableBtn') as HTMLButtonElement;
const cancelTableBtn = document.getElementById('cancelTableBtn') as HTMLButtonElement;
const tableNameElement = document.getElementById('tableNameText') as HTMLHeadingElement;
const potElement = document.getElementById('pot') as HTMLDivElement;
const communityCardsElement = document.getElementById('communityCards') as HTMLDivElement;
const playerHandElement = document.getElementById('playerHand') as HTMLDivElement;
const foldBtn = document.getElementById('foldBtn') as HTMLButtonElement;
const checkBtn = document.getElementById('checkBtn') as HTMLButtonElement;
const callBtn = document.getElementById('callBtn') as HTMLButtonElement;
const betBtn = document.getElementById('betBtn') as HTMLButtonElement;
const betAmountInput = document.getElementById('betAmount') as HTMLInputElement;
const raiseBtn = document.getElementById('raiseBtn') as HTMLButtonElement;
const leaveTableBtn = document.getElementById('leaveTableBtn') as HTMLButtonElement;

// Event listeners
loginBtn.addEventListener('click', handleLogin);
refreshTablesBtn.addEventListener('click', fetchTables);
createTableBtn.addEventListener('click', showCreateTableForm);
submitTableBtn.addEventListener('click', createTable);
cancelTableBtn.addEventListener('click', hideCreateTableForm);
leaveTableBtn.addEventListener('click', leaveTable);
foldBtn.addEventListener('click', () => performAction('fold'));
checkBtn.addEventListener('click', () => performAction('check'));
callBtn.addEventListener('click', () => performAction('call'));
betBtn.addEventListener('click', () => performAction('bet', parseInt(betAmountInput.value)));
raiseBtn.addEventListener('click', () => performAction('raise', parseInt(betAmountInput.value)));

// Socket event listeners

socket.on('playerAction', (actionData: PlayerActionData) => {
  // Display a notification with the action message
  showNotification(actionData.message);
});

// Example notification function
function showNotification(message:string) {
  const notification = document.createElement('div');
  notification.className = 'action-notification';
  notification.textContent = message;
  
  // Add to notification area
  document.querySelector('.notification-area')?.appendChild(notification);
  
  // Auto-remove after a few seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

socket.on('tableUpdate', handleTableUpdate);

// Helper functions for MCP API
function sendPokerRequest(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = {
      method,
      params,
      id: Date.now()
    };
    
    console.log(`[Client] Sending request: ${method}`, params);
    
    socket.emit('action', request, (response: any) => {
      console.log(`[Client] Received response for ${method}:`, response);
      
      if (response.error) {
        console.error(`[Client] Error in ${method}:`, response.error);
        reject(response.error);
      } else {
        resolve(response.result);
      }
    });
  });
}

// Login handler
async function handleLogin(): Promise<void> {
  const name = playerNameInput.value.trim();
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  try {
    const result = await sendPokerRequest('register', { name });
    player = result;
    console.log('Logged in as:', player);
    
    // Show tables view
    loginContainer.classList.add('hidden');
    tablesContainer.classList.remove('hidden');
    
    // Fetch available tables
    fetchTables();
  } catch (error: any) {
    alert(`Login failed: ${error.message}`);
  }
}

// Fetch tables
async function fetchTables(): Promise<void> {
  try {
    const tables = await sendPokerRequest('listTables', {});
    renderTables(tables);
  } catch (error: any) {
    alert(`Failed to fetch tables: ${error.message}`);
  }
}

// Render tables
function renderTables(tables: TableInfo[]): void {
  tableList.innerHTML = '';
  
  if (tables.length === 0) {
    tableList.innerHTML = '<p>No tables available. Create one!</p>';
    return;
  }
  
  tables.forEach(table => {
    const tableCard = document.createElement('div');
    tableCard.className = 'table-card';
    tableCard.innerHTML = `
      <h3>${table.name}</h3>
      <p>Players: ${table.players}/${table.maxPlayers}</p>
      <p>Blinds: $${table.smallBlind}/$${table.bigBlind}</p>
      <p>Status: ${table.stage}</p>
    `;
    
    tableCard.addEventListener('click', () => joinTable(table.id));
    tableList.appendChild(tableCard);
  });
}

// Show create table form
function showCreateTableForm(): void {
  tablesContainer.classList.add('hidden');
  createTableContainer.classList.remove('hidden');
}

// Hide create table form
function hideCreateTableForm(): void {
  createTableContainer.classList.add('hidden');
  tablesContainer.classList.remove('hidden');
}

// Create table
async function createTable(): Promise<void> {
  const name = tableNameInput.value.trim();
  const smallBlind = parseInt(smallBlindInput.value);
  const bigBlind = parseInt(bigBlindInput.value);
  const maxPlayers = parseInt(maxPlayersInput.value);
  
  if (!name) {
    alert('Please enter a table name');
    return;
  }
  
  try {
    const table = await sendPokerRequest('createTable', {
      name,
      smallBlind,
      bigBlind,
      maxPlayers
    });
    
    console.log('Created table:', table);
    hideCreateTableForm();
    fetchTables();
  } catch (error: any) {
    alert(`Failed to create table: ${error.message}`);
  }
}

// Join table
async function joinTable(tableId: string): Promise<void> {
  try {
    // Clear any previous table state if we're joining a new table
    if (currentTable) {
      // Unsubscribe from previous table updates
      socket.emit('unsubscribe', currentTable);
    }
    
    const result = await sendPokerRequest('joinTable', {
      playerId: player?.playerId,
      tableId
    });
    
    if (result.success) {
      currentTable = tableId;
      
      // Subscribe to table updates
      socket.emit('subscribe', tableId);
      
      // Fetch initial table state
      const tableState = await sendPokerRequest('getTableState', {
        tableId,
        playerId: player?.playerId
      });
      
      // Show game view
      tablesContainer.classList.add('hidden');
      gameContainer.classList.remove('hidden');

      container.classList.add('hide-title');
      
      // Render table state
      renderTableState(tableState);
    }
  } catch (error: any) {
    alert(`Failed to join table: ${error.message}`);
  }
}


// Perform action
async function performAction(action: string, amount: number = 0): Promise<void> {
  if (!currentTable) return;
  
  try {
    const result = await sendPokerRequest('performAction', {
      playerId: player?.playerId,
      action,
      amount
    });
    
    if (!result.success) {
      alert('Action failed');
    }
  } catch (error: any) {
    alert(`Failed to perform action: ${error.message}`);
  }
}

// Convert card notation to symbols
function formatCardWithSymbols(card: string): string {
  if (!card) return '';
  
  const value = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  
  let suitSymbol = '';
  switch (suit) {
    case 'h':
      suitSymbol = '♥';
      break;
    case 'd':
      suitSymbol = '♦';
      break;
    case 'c':
      suitSymbol = '♣';
      break;
    case 's':
      suitSymbol = '♠';
      break;
  }
  
  return `${value}${suitSymbol}`;
}

// Handle table update
function handleTableUpdate(tableState: TableState): void {
  console.log('[Client] Received table update:', tableState);
  
  if (tableState.id !== currentTable) return;
  
  // Preserve player hand if it's not included in the update
  if (currentTableState && currentTableState.players) {
    const currentPlayer = currentTableState.players.find(p => p.id === player?.playerId);
    const updatedPlayer = tableState.players.find(p => p.id === player?.playerId);
    
    if (currentPlayer && currentPlayer.hand && updatedPlayer && !updatedPlayer.hand) {
      updatedPlayer.hand = currentPlayer.hand;
    }
  }
  
  currentTableState = tableState;
  renderTableState(tableState);
}

// Render table state
function renderTableState(tableState: TableState): void {
  // Update table name
  tableNameElement.textContent = tableState.name;
  
  // Update pot
  potElement.textContent = `Pot: $${tableState.pot}`;
  
  
  // Update game stage
  const stageElement = document.getElementById('game-stage');
  if (stageElement) {
    // Format the stage name for display (capitalize and replace hyphens with spaces)
    const stageName = tableState.stage
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    stageElement.textContent = `${tableState.name}: ${stageName}`;
  }
  
  // Update community cards
  communityCardsElement.innerHTML = '';
  tableState.communityCards.forEach(card => {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    
    // Convert card notation to symbols
    const cardText = formatCardWithSymbols(card);
    
    // For hearts and diamonds, wrap the symbol in a span with red class
    if (cardText.endsWith('♥') || cardText.endsWith('♦')) {
      const value = cardText.slice(0, -1);
      const symbol = cardText.slice(-1);
      cardElement.innerHTML = `${value}<span class="red">${symbol}</span>`;
    } else {
      cardElement.innerHTML = cardText;
    }
    
    communityCardsElement.appendChild(cardElement);
  });
  
  // Update player hand
  playerHandElement.innerHTML = '';
  const currentPlayerObj = tableState.players.find(p => p.id === player?.playerId);
  if (currentPlayerObj && currentPlayerObj.hand) {
    currentPlayerObj.hand.forEach(card => {
      const cardElement = document.createElement('div');
      cardElement.className = 'card';
      
      // Convert card notation to symbols
      const cardText = formatCardWithSymbols(card);
      
      // For hearts and diamonds, wrap the symbol in a span with red class
      if (cardText.endsWith('♥') || cardText.endsWith('♦')) {
        const value = cardText.slice(0, -1);
        const symbol = cardText.slice(-1);
        cardElement.innerHTML = `${value}<span class="red">${symbol}</span>`;
      } else {
        cardElement.innerHTML = cardText;
      }
      
      playerHandElement.appendChild(cardElement);
    });
  }
  
  // Update player seats
  const pokerSeatContainer = document.querySelector('.player-seats-container') as HTMLDivElement;
  
  // Remove existing player seats
  document.querySelectorAll('.player-seat').forEach(seat => seat.remove());
  
  // Add player seats
  tableState.players.forEach((p, index) => {
    // Calculate position based on container dimensions
    const containerRect = pokerSeatContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Calculate center point
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    
    // Calculate radius (slightly smaller than container)
    const radiusX = centerX * 0.8;
    const radiusY = centerY * 0.8;
    
    // Calculate angle for this player (distribute evenly around the table)
    const angle = (index / tableState.players.length) * 2 * Math.PI;
    
    // Calculate position (subtract half the seat size for centering)
    const seatSize = 120; // Size of player seat
    const x = centerX + radiusX * Math.cos(angle) - (seatSize / 2);
    const y = centerY + radiusY * Math.sin(angle) - (seatSize / 2);
    
    const seatElement = document.createElement('div');
    seatElement.className = 'player-seat';
    if (p.isActive) {
      seatElement.classList.add('active');
    }
    
    // Use percentage-based positioning for better responsiveness
    seatElement.style.position = 'absolute';
    seatElement.style.left = `${(x / containerWidth) * 100}%`;
    seatElement.style.top = `${(y / containerHeight) * 100}%`;
    
    seatElement.innerHTML = `
      <div>${p.name}</div>
      <div>$${p.chips}</div>
      ${p.bet > 0 ? `<div>Bet: $${p.bet}</div>` : ''}
      ${p.folded ? '<div>Folded</div>' : ''}
      ${p.isAllIn ? '<div>All In</div>' : ''}
      ${p.isDealer ? '<div>D</div>' : ''}
      ${p.isSmallBlind ? '<div>SB</div>' : ''}
      ${p.isBigBlind ? '<div>BB</div>' : ''}
    `;
    
    pokerSeatContainer.appendChild(seatElement);
  });
  
  // Update action buttons
  const isPlayerTurn = currentPlayerObj && currentPlayerObj.isActive;
  const canCheck = isPlayerTurn && (currentPlayerObj.bet >= tableState.currentBet);
  const canCall = isPlayerTurn && (currentPlayerObj.bet < tableState.currentBet);
  const canBet = isPlayerTurn && tableState.currentBet === 0;
  const canRaise = isPlayerTurn && tableState.currentBet > 0;
  
  foldBtn.disabled = !isPlayerTurn;
  checkBtn.disabled = !canCheck;
  callBtn.disabled = !canCall;
  betBtn.disabled = !canBet;
  raiseBtn.disabled = !canRaise;
  
  if (canCall) {
    const callAmount = tableState.currentBet - (currentPlayerObj.bet || 0);
    callBtn.textContent = `Call $${callAmount}`;
  } else {
    callBtn.textContent = 'Call';
  }
  
  if (canBet) {
    betAmountInput.min = tableState.bigBlind.toString();
    betAmountInput.value = tableState.bigBlind.toString();
  }
  
  if (canRaise) {
    const minRaise = tableState.currentBet * 2;
    betAmountInput.min = minRaise.toString();
    betAmountInput.value = minRaise.toString();
  }


  // Handle countdown timer
  
  // Clear any existing countdown
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  // If it's player's turn and we have remaining time info, show countdown
  if (isPlayerTurn && tableState.remainingActionTime && tableState.remainingActionTime > 0) {
    countdownValue = Math.ceil(tableState.remainingActionTime);
    updateCountdownDisplay();
    
    countdownTimer = window.setInterval(() => {
      countdownValue--;
      if (countdownValue <= 0) {
        clearInterval(countdownTimer!);
        countdownTimer = null;
      }
      updateCountdownDisplay();
    }, 1000);
  } else {
    // Hide countdown if it's not player's turn
    countdownElement.style.display = 'none';
  }
}

// Add function to update countdown display
function updateCountdownDisplay(): void {
  if (countdownValue <= 0) {
    countdownElement.style.display = 'none';
    return;
  }
  
  countdownElement.style.display = 'block';
  
  // Position the countdown near the action buttons
  const actionButtons = document.querySelector('.action-buttons');
  if (actionButtons) {
    const rect = actionButtons.getBoundingClientRect();
    countdownElement.style.position = 'absolute';
    countdownElement.style.top = `${rect.top - 60}px`;
    countdownElement.style.left = `${rect.left}px`;
  }
  
  // Update the content with countdown value
  let content = `<div class="time-remaining ${countdownValue <= 10 ? 'urgent' : ''}">
    Time remaining: ${countdownValue}s
  </div>`;
  
  // Add warning message when time is running low
  if (countdownValue <= 10) {
    content += `<div class="warning-message">
      Warning: Make your move soon or it will be auto-played!
    </div>`;
  }
  
  countdownElement.innerHTML = content;
}

// Add cleanup when leaving table
async function leaveTable(): Promise<void> {
  if (!currentTable) return;
  
  // Clear countdown timer when leaving table
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  
  try {
    const result = await sendPokerRequest('leaveTable', {
      playerId: player?.playerId
    });
    
    if (result.success) {
      // Unsubscribe from table updates
      socket.emit('unsubscribe', currentTable);
      
      // Reset table state variables
      currentTable = null;
      currentTableState = null;
      
      // Show tables view
      gameContainer.classList.add('hidden');
      tablesContainer.classList.remove('hidden');

      container.classList.remove('hide-title');
      
      // Refresh tables with a slight delay to ensure server has processed the leave
      setTimeout(fetchTables, 500);
    }
  } catch (error: any) {
    alert(`Failed to leave table: ${error.message}`);
  }
}
