// Connect to the WebSocket server
const socket = new WebSocket('ws://localhost:3000');

// Log WebSocket status
socket.onopen = () => console.log('WebSocket connection established');
socket.onclose = () => console.log('WebSocket connection closed');
socket.onerror = (error) => console.log('WebSocket Error:', error);

// Store purchased players for each team
let purchasedPlayers = {
    MI: [],
    RCB: [],
    CSK: []
};

// Listen for messages from the server
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Message from server:', data);

    switch (data.type) {
        case 'teamDetails':
            updateTeamList(Object.keys(data.teamBudgets)); // Show teams
            updateTeamBudgets(data.teamBudgets);
            updatePurchasedPlayers(data.purchasedPlayers);
            break;

        case 'playerSold':
            if (!purchasedPlayers[data.team]) {
                purchasedPlayers[data.team] = [];
            }
            purchasedPlayers[data.team].push({
                name: data.player.name,
                price: data.bidAmount
            });

            updatePlayerList(data.team);
            alert(`${data.player.name} sold to ${data.team} for ₹${data.bidAmount}`);
            break;

        case 'startAuction':
            startCountdown();
            displayAuctionPlayer(data.auctionData);
            break;

        case 'newAuctionPlayer':
            startCountdown();
            displayAuctionPlayer(data.player);
            break;

        case 'playerUnsold':
            displayPlayerUnsold(data.player);
            break;

        case 'timerUpdate':
            updateTimerDisplay(data.timeLeft);
            break;

        case 'auctionComplete':
            alert('The auction has ended!');
            break;

        default:
            console.warn('Unknown message type:', data.type);
            break;
    }
};

// Update team budgets
function updateTeamBudgets(teamBudgets) {
    const teamBudgetElement = document.getElementById('team-budgets');
    teamBudgetElement.innerHTML = '';

    for (const team in teamBudgets) {
        const div = document.createElement('div');
        div.innerHTML = `${team}: ₹${teamBudgets[team]}`;
        teamBudgetElement.appendChild(div);
    }
}

// Update purchased players for all teams
function updatePurchasedPlayers(purchasedPlayers) {
    for (const team in purchasedPlayers) {
        purchasedPlayers[team].forEach(player => {
            if (!purchasedPlayers[team]) {
                purchasedPlayers[team] = [];
            }
            purchasedPlayers[team].push({ name: player.name, price: player.purchasedPrice });
        });
    }
}

// Function to update player list when a team is clicked
function updatePlayerList(team) {
    const playerList = document.getElementById('player-list');
    playerList.innerHTML = `<h3>${team}</h3>`; // Show team name above list
    const ul = document.createElement('ul');

    if (!purchasedPlayers[team] || purchasedPlayers[team].length === 0) {
        ul.innerHTML = '<li>No players purchased yet.</li>';
    } else {
        purchasedPlayers[team].forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.name} - ₹${player.price}`;
            ul.appendChild(li);
        });
    }

    playerList.appendChild(ul);
}

// Function to update the team list sidebar
function updateTeamList(teams) {
    const teamList = document.getElementById('team-list');
    teamList.innerHTML = ''; // Clear existing list

    teams.forEach(team => {
        const div = document.createElement('div');
        div.classList.add('team-name');
        div.setAttribute('data-team', team);
        div.textContent = team;
        teamList.appendChild(div);
    });

    // Rebind click event dynamically for updated elements
    document.querySelectorAll('.team-name').forEach(item => {
        item.addEventListener('click', function () {
            const team = this.getAttribute('data-team');
            updatePlayerList(team);
        });
    });
}

// Handle team selection logic
let selectedTeam = null;

// Add event listener for team selection
document.getElementById('team-buttons').addEventListener('click', (event) => {
    let button = event.target.closest('.team-button'); // Ensure button click is detected
    if (button) {
        const team = button.getAttribute('data-team');
        selectTeam(team);
    }
});

// Function to handle team selection
function selectTeam(team) {
    if (selectedTeam) {
        alert(`You have already selected ${selectedTeam}.`);
        return;
    }

    selectedTeam = team;
    socket.send(JSON.stringify({ type: 'select-team', team })); // Send selected team to server
    document.getElementById('team-selection').style.display = 'none'; // Hide team selection after selection
}

// Send bid to server
function placeBid(bidAmount) {
    if (!selectedTeam) {
        alert('Please select a team first!');
        return;
    }

    const bidData = {
        type: 'placeBid',
        bidAmount,
    };
    socket.send(JSON.stringify(bidData));
}

// Event listener for placing a bid
document.getElementById('placeBidBtn').addEventListener('click', () => {
    const bidAmount = parseInt(document.getElementById('bid-amount').value, 10); // Get bid amount
    if (bidAmount > 0) {
        placeBid(bidAmount); // Send bid via WebSocket
    } else {
        alert('Please enter a valid bid amount!');
    }
});

// Display current auction player
function displayAuctionPlayer(player) {
    document.getElementById('playerName').innerText = player.name;
    document.getElementById('playerBasePrice').innerText = `₹${player.basePrice}`;
    document.getElementById('categoryName').innerText = player.category;
}

// Display sold player
function displayPlayerSold(player, team, bidAmount) {
    alert(`${player.name} sold to ${team} for ₹${bidAmount}`);
    updatePurchasedPlayers([{ name: player.name, purchasedPrice: bidAmount }]);
}

// Display unsold player
function displayPlayerUnsold(player) {
    alert(`${player.name} remains unsold.`);
}

// Countdown Timer Logic
let auctionDuration = 20; // Total duration for the timer
let currentTimer = auctionDuration;

// References
const auctionTimer = document.getElementById('auction-timer');
const timerProgress = document.getElementById('timer-progress');

// Function to start the countdown timer
function startCountdown() {
    currentTimer = auctionDuration; // Reset timer
    auctionTimer.textContent = currentTimer; // Set initial time
    timerProgress.style.width = '100%'; // Reset progress bar width

    const timerInterval = setInterval(() => {
        currentTimer -= 1; // Decrement time
        auctionTimer.textContent = currentTimer; // Update timer display
        timerProgress.style.width = `${(currentTimer / auctionDuration) * 100}%`; // Update progress bar

        if (currentTimer <= 0) {
            clearInterval(timerInterval); // Stop the timer
            timerProgress.style.width = '0%'; // Ensure bar is empty
            socket.send(JSON.stringify({ type: 'timerEnded' })); // Notify server that time is up
        }
    }, 1000); // Run every second
}

// Update timer display
function updateTimerDisplay(timeLeft) {
    auctionTimer.textContent = timeLeft;
    timerProgress.style.width = `${(timeLeft / auctionDuration) * 100}%`;
}
