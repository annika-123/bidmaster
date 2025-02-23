const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Load auction data
const auctionData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/players.json')));

// Variables to track game state
let players = [];
let connectedClients = [];
let currentCategoryIndex = 0;
let currentPlayerIndex = 0;
let highestBid = null;
let auctionTimer = null;
let purchasedPlayers = { MI: [], RCB: [], CSK: [] }; // Store purchased players per team

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// WebSocket connection logic
wss.on('connection', (ws) => {
    if (connectedClients.length >= 3) {
        ws.send(JSON.stringify({ type: 'error', message: 'Maximum players connected. Try again later.' }));
        setTimeout(() => ws.close(), 1000);
        return;
    }

    connectedClients.push(ws);
    const playerId = connectedClients.length;
    console.log(`Player ${playerId} connected.`);

    // Send initial team data
    ws.send(JSON.stringify({ type: 'teamDetails', teamBudgets: getTeamBudgets(), purchasedPlayers }));

    // Handle incoming WebSocket messages
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        if (data.type === 'select-team') {
            handleTeamSelection(ws, playerId, data.team);
        } else if (data.type === 'placeBid') {
            handleBid(ws, playerId, data.bidAmount);
        } else if (data.type === 'timerEnded') {
            handleTimerEnd();
        }
    });

    ws.on('close', () => {
        connectedClients = connectedClients.filter((client) => client !== ws);
        console.log(`Player ${playerId} disconnected.`);
    });
});

// Broadcast a message to all connected clients
function broadcast(message) {
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Handle team selection logic
function handleTeamSelection(ws, playerId, team) {
    if (isTeamTaken(team)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Team already taken. Choose another team.' }));
    } else {
        players.push({ id: playerId, team, budget: 1000 });
        ws.send(JSON.stringify({ type: 'teamSelected', message: `Team ${team} selected.` }));
        broadcast({ type: 'waitingForPlayers', remaining: 3 - players.length });

        if (players.length === 3) {
            startAuction();
        }
    }
}

// Check if a team is already taken
function isTeamTaken(team) {
    return players.some((player) => player.team === team);
}

// Start the auction process
function startAuction() {
    console.log('All players joined. Starting auction...');
    broadcast({ type: 'startAuction', auctionData: getCurrentPlayerData() });
    startTimer();
}

// Handle bid logic
function handleBid(ws, playerId, bidAmount) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if (isNaN(bidAmount) || bidAmount <= 0 || bidAmount <= (highestBid?.amount || 0) || bidAmount > player.budget) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid bid.' }));
        return;
    }

    highestBid = { amount: bidAmount, team: player.team };
    broadcast({ type: 'newHighestBid', bidAmount, team: player.team });
}

// Get current player's data
function getCurrentPlayerData() {
    const category = auctionData.categories[currentCategoryIndex];
    return { ...category.players[currentPlayerIndex], category: category.name };
}

// Start the auction timer
function startTimer() {
    let timeLeft = 20;
    auctionTimer = setInterval(() => {
        timeLeft--;
        broadcast({ type: 'timerUpdate', timeLeft });
        if (timeLeft === 0) {
            clearInterval(auctionTimer);
            handleTimerEnd();
        }
    }, 1000);
}

// Handle the end of the timer
function handleTimerEnd() {
    if (highestBid) {
        finalizeAuction();
    } else {
        broadcast({ type: 'playerUnsold', player: getCurrentPlayerData() });
        moveToNextPlayer();
    }
}

// Finalize the auction for the current player
function finalizeAuction() {
    const playerData = getCurrentPlayerData();
    purchasedPlayers[highestBid.team].push({ name: playerData.name, price: highestBid.amount });

    broadcast({ 
        type: 'playerSold', 
        player: playerData, 
        team: highestBid.team, 
        bidAmount: highestBid.amount, 
        purchasedPlayers 
    });

    const winningPlayer = players.find((p) => p.team === highestBid.team);
    if (winningPlayer) {
        winningPlayer.budget -= highestBid.amount;
    }

    highestBid = null;
    moveToNextPlayer();
}

// Move to the next player or category
function moveToNextPlayer() {
    currentPlayerIndex++;
    if (currentPlayerIndex >= auctionData.categories[currentCategoryIndex].players.length) {
        currentPlayerIndex = 0;
        currentCategoryIndex++;
    }
    if (currentCategoryIndex >= auctionData.categories.length) {
        broadcast({ type: 'auctionComplete' });
        console.log('Auction complete.');
        resetAuction();
        return;
    }
    broadcast({ type: 'newAuctionPlayer', player: getCurrentPlayerData() });
    startTimer();
}

// Get team budgets
function getTeamBudgets() {
    return players.reduce((acc, player) => {
        acc[player.team] = player.budget;
        return acc;
    }, {});
}

// Reset the auction state for a new session
function resetAuction() {
    players = [];
    connectedClients = [];
    currentCategoryIndex = 0;
    currentPlayerIndex = 0;
    highestBid = null;
    purchasedPlayers = { MI: [], RCB: [], CSK: [] };
}

// Start the server
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
