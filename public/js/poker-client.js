"use strict";
// First install socket.io-client: npm install socket.io-client @types/socket.io-client
// Remove the import and use the global io object
// import { io } from 'socket.io-client';
// Connect to the server
const socket = window.io();
let player = null;
let currentTable = null;
let currentTableState = null;
// DOM elements
const loginContainer = document.getElementById('loginContainer');
const tablesContainer = document.getElementById('tablesContainer');
const createTableContainer = document.getElementById('createTableContainer');
const gameContainer = document.getElementById('gameContainer');
const playerNameInput = document.getElementById('playerName');
const loginBtn = document.getElementById('loginBtn');
const refreshTablesBtn = document.getElementById('refreshTablesBtn');
const createTableBtn = document.getElementById('createTableBtn');
const tableList = document.getElementById('tableList');
const tableNameInput = document.getElementById('tableName');
const smallBlindInput = document.getElementById('smallBlind');
const bigBlindInput = document.getElementById('bigBlind');
const maxPlayersInput = document.getElementById('maxPlayers');
const submitTableBtn = document.getElementById('submitTableBtn');
const cancelTableBtn = document.getElementById('cancelTableBtn');
const tableNameElement = document.getElementById('tableNameText');
const potElement = document.getElementById('pot');
const communityCardsElement = document.getElementById('communityCards');
const playerHandElement = document.getElementById('playerHand');
const foldBtn = document.getElementById('foldBtn');
const checkBtn = document.getElementById('checkBtn');
const callBtn = document.getElementById('callBtn');
const betBtn = document.getElementById('betBtn');
const betAmountInput = document.getElementById('betAmount');
const raiseBtn = document.getElementById('raiseBtn');
const leaveTableBtn = document.getElementById('leaveTableBtn');
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
socket.on('tableUpdate', handleTableUpdate);
// Helper functions for MCP API
function sendPokerRequest(method, params) {
    return new Promise((resolve, reject) => {
        const request = {
            method,
            params,
            id: Date.now()
        };
        console.log(`[Client] Sending request: ${method}`, params);
        socket.emit('action', request, (response) => {
            console.log(`[Client] Received response for ${method}:`, response);
            if (response.error) {
                console.error(`[Client] Error in ${method}:`, response.error);
                reject(response.error);
            }
            else {
                resolve(response.result);
            }
        });
    });
}
// Login handler
async function handleLogin() {
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
    }
    catch (error) {
        alert(`Login failed: ${error.message}`);
    }
}
// Fetch tables
async function fetchTables() {
    try {
        const tables = await sendPokerRequest('listTables', {});
        renderTables(tables);
    }
    catch (error) {
        alert(`Failed to fetch tables: ${error.message}`);
    }
}
// Render tables
function renderTables(tables) {
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
function showCreateTableForm() {
    tablesContainer.classList.add('hidden');
    createTableContainer.classList.remove('hidden');
}
// Hide create table form
function hideCreateTableForm() {
    createTableContainer.classList.add('hidden');
    tablesContainer.classList.remove('hidden');
}
// Create table
async function createTable() {
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
    }
    catch (error) {
        alert(`Failed to create table: ${error.message}`);
    }
}
// Join table
async function joinTable(tableId) {
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
            // Render table state
            renderTableState(tableState);
        }
    }
    catch (error) {
        alert(`Failed to join table: ${error.message}`);
    }
}
// Leave table
async function leaveTable() {
    if (!currentTable)
        return;
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
            // Refresh tables with a slight delay to ensure server has processed the leave
            setTimeout(fetchTables, 500);
        }
    }
    catch (error) {
        alert(`Failed to leave table: ${error.message}`);
    }
}
// Perform action
async function performAction(action, amount = 0) {
    if (!currentTable)
        return;
    try {
        const result = await sendPokerRequest('performAction', {
            playerId: player?.playerId,
            action,
            amount
        });
        if (!result.success) {
            alert('Action failed');
        }
    }
    catch (error) {
        alert(`Failed to perform action: ${error.message}`);
    }
}
// Convert card notation to symbols
function formatCardWithSymbols(card) {
    if (!card)
        return '';
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
function handleTableUpdate(tableState) {
    console.log('[Client] Received table update:', tableState);
    if (tableState.id !== currentTable)
        return;
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
function renderTableState(tableState) {
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
        stageElement.textContent = `Stage: ${stageName}`;
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
        }
        else {
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
            }
            else {
                cardElement.innerHTML = cardText;
            }
            playerHandElement.appendChild(cardElement);
        });
    }
    // Update player seats
    const pokerTable = document.querySelector('.poker-table');
    // Remove existing player seats
    document.querySelectorAll('.player-seat').forEach(seat => seat.remove());
    // Add player seats
    tableState.players.forEach((p, index) => {
        const angle = (index / tableState.players.length) * 2 * Math.PI;
        const x = 400 + 300 * Math.cos(angle);
        const y = 200 + 150 * Math.sin(angle);
        const seatElement = document.createElement('div');
        seatElement.className = 'player-seat';
        if (p.isActive) {
            seatElement.classList.add('active');
        }
        seatElement.style.left = `${x - 60}px`;
        seatElement.style.top = `${y - 60}px`;
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
        pokerTable.appendChild(seatElement);
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
    }
    else {
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
}
