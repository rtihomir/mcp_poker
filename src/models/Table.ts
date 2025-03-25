import { Card } from './Card';
import { Deck } from './Deck';
import { Player, PlayerAction } from './Player';
import { HandEvaluator, HandResult } from '../services/HandEvaluator';

import { broadcastTableUpdate } from '../index';

export enum GameStage {
  WAITING = "waiting",
  PRE_FLOP = "pre-flop",
  FLOP = "flop",
  TURN = "turn",
  RIVER = "river",
  SHOWDOWN = "showdown"
}

export class Table {
  id: string;
  name: string;
  players: Player[] = [];
  deck: Deck = new Deck();
  communityCards: Card[] = [];
  pot: number = 0;
  currentBet: number = 0;
  smallBlind: number;
  bigBlind: number;
  dealerPosition: number = -1;
  currentPlayerIndex: number = -1;
  stage: GameStage = GameStage.WAITING;
  maxPlayers: number;
  minPlayers: number = 2;
  // Add timer properties
  private actionTimer: NodeJS.Timeout | null = null;
  private actionTimeoutSeconds: number = 120;
  
  constructor(id: string, name: string, smallBlind: number = 5, bigBlind: number = 10, maxPlayers: number = 9) {
    this.id = id;
    this.name = name;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.maxPlayers = maxPlayers;
  }

  addPlayer(player: Player): boolean {
    if (this.players.length >= this.maxPlayers) {
      return false;
    }
    
    this.players.push(player);
    
    if (this.players.length >= this.minPlayers && this.stage === GameStage.WAITING) {
      this.startGame();
    }
    
    broadcastTableUpdate(this.id);
    return true;
  }

  removePlayer(playerId: string): boolean {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) {
      return false;
    }
    
    this.players.splice(index, 1);
    
    if (this.players.length < this.minPlayers) {
      this.stage = GameStage.WAITING;
    }
    
    broadcastTableUpdate(this.id);
    return true;
  }

  startGame(): void {
    console.log("Starting game");
    if (this.players.length < this.minPlayers) {
      return;
    }
    
    // Reset game state
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    
    // Reset player hands and action flags
    this.players.forEach(player => {
      player.resetHand();
      player.hasActedThisStage = false;
    });
    
    // Move dealer button
    this.dealerPosition = (this.dealerPosition + 1) % this.players.length;
    
    // Set blinds
    const smallBlindPos = (this.dealerPosition + 1) % this.players.length;
    const bigBlindPos = (this.dealerPosition + 2) % this.players.length;
    
    this.players[this.dealerPosition].isDealer = true;
    this.players[smallBlindPos].isSmallBlind = true;
    this.players[bigBlindPos].isBigBlind = true;
    
    // Post blinds
    this.pot += this.players[smallBlindPos].placeBet(this.smallBlind);
    this.pot += this.players[bigBlindPos].placeBet(this.bigBlind);
    this.currentBet = this.bigBlind;
    
    // Deal cards
    for (let i = 0; i < 2; i++) {
      for (let player of this.players) {
        const card = this.deck.dealCard();
        if (card) {
          player.addCard(card);
        }
      }
    }

    
    // Set first player to act (after big blind)
    this.currentPlayerIndex = (bigBlindPos + 1) % this.players.length;
    this.players[this.currentPlayerIndex].isActive = true;
    
    this.stage = GameStage.PRE_FLOP;

    this.setActionTimer();
  }

  handlePlayerAction(playerId: string, action: PlayerAction, amount: number = 0): boolean {
    // Find the player
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.currentPlayerIndex) {
      return false;
    }
  
    const player = this.players[playerIndex];
    
    // Process the action
    switch (action) {
      case PlayerAction.FOLD:
        player.fold();
        break;
        
      case PlayerAction.CHECK:
        // Player can only check if they've matched the current bet
        if (player.bet < this.currentBet) {
          return false;
        }
        
        // Mark this player as having checked
        player.isChecked = true;
        
        // Check if all active players have checked
        if (this.haveAllPlayersChecked()) {
          // Move to the next stage directly
          player.isActive = false;
          this.moveToNextStage();
          broadcastTableUpdate(this.id);
          return true;
        }
        break;
        
      case PlayerAction.CALL:
        const callAmount = this.currentBet - player.bet;
        if (callAmount <= 0) {
          // If nothing to call, treat as a check
          break;
        }
        
        // Check if player has enough chips
        if (player.chips < callAmount) {
          // All-in case
          this.pot += player.chips;
          player.bet += player.chips;
          player.chips = 0;
          player.isAllIn = true;
        } else {
          // Regular call
          this.pot += callAmount;
          player.chips -= callAmount;
          player.bet += callAmount;
        }
        break;
        
      case PlayerAction.BET:
        if (this.currentBet > 0 || amount < this.bigBlind) {
          return false;
        }
        this.pot += player.placeBet(amount);
        this.currentBet = amount;
        
        // Reset all players' isChecked flags when someone bets
        this.players.forEach(p => p.isChecked = false);
        break;
        
      case PlayerAction.RAISE:
        if (amount <= this.currentBet || amount < this.currentBet * 2) {
          return false;
        }
        this.pot += player.placeBet(amount - player.bet);
        this.currentBet = amount;
        
        // Reset all players' isChecked flags when someone raises
        this.players.forEach(p => p.isChecked = false);
        break;
        
      case PlayerAction.ALL_IN:
        const allInAmount = player.chips;
        this.pot += player.placeBet(allInAmount);
        if (player.bet > this.currentBet) {
          this.currentBet = player.bet;
        }
        break;
        
      default:
        return false;
    }
    
    // Mark that this player has acted in this stage
    player.hasActedThisStage = true;
    player.isActive = false;
    
    // Move to next player or next stage
    this.moveToNextPlayer();
    
    // Broadcast the table update after the action
    broadcastTableUpdate(this.id);
    
    return true;
  }

  moveToNextPlayer(): void {
    // Clear previous timer
    this.clearActionTimer();
    
    // Check if only one player remains (not folded)
    const activePlayers = this.players.filter(p => !p.folded);
    if (activePlayers.length === 1) {
      console.log("Only one player remains, they win automatically");
      // Award pot to the last remaining player
      activePlayers[0].chips += this.pot;
      this.pot = 0;
      
      // Move to showdown to end the round
      this.stage = GameStage.SHOWDOWN;
      
      // Broadcast the update so players can see the winner
      broadcastTableUpdate(this.id);
      
      // Start a new game after a delay
      console.log("Starting new game in 5 seconds");
      setTimeout(() => {
        this.startGame();
        broadcastTableUpdate(this.id);
      }, 5000);
      return;
    }
    
    // Check if round is complete
    if (this.isRoundComplete()) {
      console.log("Round is complete, move to next state");
      this.moveToNextStage();
      return;
    }
    
    // Find next active player
    let nextPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    while (
      this.players[nextPlayerIndex].folded || 
      this.players[nextPlayerIndex].isAllIn ||
      (this.currentBet > 0 && this.players[nextPlayerIndex].bet === this.currentBet && this.stage !== GameStage.PRE_FLOP)
    ) {
      nextPlayerIndex = (nextPlayerIndex + 1) % this.players.length;
      
      // If we've gone full circle, end the round
      if (nextPlayerIndex === this.currentPlayerIndex) {
        console.log("Got full circle, move to next state");
        this.moveToNextStage();
        return;
      }
    }
    
    this.currentPlayerIndex = nextPlayerIndex;
    this.players[this.currentPlayerIndex].isActive = true;
    
    // Set action timeout for current player
    this.setActionTimer();
    
    // Broadcast update to let clients know whose turn it is
    broadcastTableUpdate(this.id);
  }

  // Add method to set the timer
  // Add a property to track when the timer started
  private actionTimerStartTime: number = 0;
  
  // Modify setActionTimer method to record start time
  private setActionTimer(): void {
    console.log('setActionTimer')
    // Make sure to clear previous timer first
    this.clearActionTimer();
    
    // Record the start time
    this.actionTimerStartTime = Date.now();
    
    // Set new timer
    this.actionTimer = setTimeout(() => {
      // If timer triggers, perform automatic action
      if (this.currentPlayerIndex >= 0 && this.currentPlayerIndex < this.players.length) {
        const player = this.players[this.currentPlayerIndex];
        console.log(`Player ${player.name} (${player.id}) timeout, performing auto action`);
        
        // Try to Check first, if not possible then Fold
        const canCheck = player.bet >= this.currentBet;
        
        if (canCheck) {
          console.log(`Auto checking for player ${player.name}`);
          this.handlePlayerAction(player.id, PlayerAction.CHECK);
        } else {
          console.log(`Auto folding for player ${player.name}`);
          this.handlePlayerAction(player.id, PlayerAction.FOLD);
        }
      }
    }, this.actionTimeoutSeconds * 1000);
  }
  
  // Add method to clear the timer
  private clearActionTimer(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  isRoundComplete(): boolean {
    // Check if all players have folded except one
    const activePlayers = this.players.filter(p => !p.folded);
    if (activePlayers.length === 1) {
      return true;
    }
    
    // Make sure all non-folded players have had a chance to act in this stage
    const nonFoldedPlayers = this.players.filter(p => !p.folded);
    const allPlayersHaveActed = nonFoldedPlayers.every(p => p.hasActedThisStage || p.isAllIn);
    
    if (!allPlayersHaveActed) {
      return false;
    }

    // Check if all remaining players have bet the same amount or are all-in
    return this.players.every(p => 
      p.folded || 
      p.isAllIn || 
      p.isChecked ||
      this.currentBet > 0 && p.bet === this.currentBet
    );
  }

  // New method to check if all active players have checked
  private haveAllPlayersChecked(): boolean {
    // Get active players who haven't folded or gone all-in
    const activePlayers = this.players.filter(p => !p.folded && !p.isAllIn);
    
    // If there are no active players or just one, return true
    if (activePlayers.length <= 1) {
      return true;
    }
    
    // Check if all active players have checked
    return activePlayers.every(p => p.isChecked);
  }

  moveToNextStage(): void {
    // Reset player bets for the next round
    this.players.forEach(p => {
      p.isActive = false;
      p.isChecked = false; // Reset isChecked when moving to next stage
      p.bet = 0; // Reset player bets when moving to next stage
      p.hasActedThisStage = false; // Reset hasActedThisStage flag for the new stage
    });
    
    // Reset the current bet for the new betting round
    this.currentBet = 0;
    
    switch (this.stage) {
      case GameStage.PRE_FLOP:
        // Deal flop
        for (let i = 0; i < 3; i++) {
          const card = this.deck.dealCard();
          if (card) {
            this.communityCards.push(card);
          }
        }
        this.stage = GameStage.FLOP;
        break;
        
      case GameStage.FLOP:
        // Deal turn
        const turnCard = this.deck.dealCard();
        if (turnCard) {
          this.communityCards.push(turnCard);
        }
        this.stage = GameStage.TURN;
        break;
        
      case GameStage.TURN:
        // Deal river
        const riverCard = this.deck.dealCard();
        if (riverCard) {
          this.communityCards.push(riverCard);
        }
        this.stage = GameStage.RIVER;
        break;
        
      case GameStage.RIVER:
        // Move to showdown
        this.stage = GameStage.SHOWDOWN;
        this.determineWinner();

        // Broadcast the update so players can see the winner
        broadcastTableUpdate(this.id);
        
        console.log("Starting new game in 5 seconds");
        setTimeout(() => {
            this.startGame();
            broadcastTableUpdate(this.id);
        }, 5000);
        return;
        
      case GameStage.SHOWDOWN:
        // Start new game
        return;
    }
    
    // Set first player to act (after dealer)
    this.currentPlayerIndex = (this.dealerPosition + 1) % this.players.length;
    
    // Skip folded and all-in players
    while (
      this.players[this.currentPlayerIndex].folded || 
      this.players[this.currentPlayerIndex].isAllIn
    ) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      
      // If all players are folded or all-in, move to next stage
      if (this.currentPlayerIndex === (this.dealerPosition + 1) % this.players.length) {
        this.moveToNextStage();
        return;
      }
    }
    
    this.players[this.currentPlayerIndex].isActive = true;
    
    // Set action timeout for the current player after moving to next stage
    this.setActionTimer();
    
    // Broadcast the update so clients know whose turn it is
    broadcastTableUpdate(this.id);
  }

  determineWinner(): void {
    // Get all active (non-folded) players
    const activePlayers = this.players.filter(p => !p.folded);
    
    if (activePlayers.length === 1) {
      // Only one player left, they win
      activePlayers[0].chips += this.pot;
      console.log(`Player ${activePlayers[0].name} wins ${this.pot} chips as the only remaining player`);
    } else {
      // Evaluate hands for all active players
      const playerHands: { player: Player; handResult: HandResult }[] = [];
      
      for (const player of activePlayers) {
        const handResult = HandEvaluator.evaluateHand(player.hand, this.communityCards);
        playerHands.push({ player, handResult });
        console.log(`${player.name}'s hand: ${handResult.description}`);
      }
      
      // Sort by hand strength (highest first)
      playerHands.sort((a, b) => 
        HandEvaluator.compareHands(b.handResult, a.handResult)
      );
      
      // Check for ties
      const winners: { player: Player; handResult: HandResult }[] = [playerHands[0]];
      
      for (let i = 1; i < playerHands.length; i++) {
        if (HandEvaluator.compareHands(playerHands[0].handResult, playerHands[i].handResult) === 0) {
          winners.push(playerHands[i]);
        } else {
          break; // No more ties
        }
      }
      
      // Split pot among winners
      const winAmount = Math.floor(this.pot / winners.length);
      const remainder = this.pot % winners.length;
      
      for (const winner of winners) {
        winner.player.chips += winAmount;
      }
      
      // Add remainder to first winner (can't split odd chips evenly)
      if (remainder > 0) {
        winners[0].player.chips += remainder;
      }
      
      // Log the winners
      const winnerNames = winners.map(w => `${w.player.name} (${w.handResult.description})`).join(', ');
      console.log(`Winners: ${winnerNames} each win ${winAmount} chips`);
    }
    
    this.pot = 0;
    
    // Check for players with zero chips and remove them
    this.removePlayersWithNoChips();
  }
  
  // New method to remove players with no chips
  private removePlayersWithNoChips(): void {
    const playersToRemove = this.players.filter(player => player.chips <= 0);
    
    if (playersToRemove.length > 0) {
      console.log(`Removing ${playersToRemove.length} players with no chips`);
      
      // Remove each player
      playersToRemove.forEach(player => {
        console.log(`Player ${player.name} has no chips left and is being removed`);
        const index = this.players.findIndex(p => p.id === player.id);
        if (index !== -1) {
          this.players.splice(index, 1);
        }
      });
      
      // If not enough players left, set stage to waiting
      if (this.players.length < this.minPlayers) {
        console.log("Not enough players left, setting stage to WAITING");
        this.stage = GameStage.WAITING;
      }
    }
  }

  // Add method to get remaining time
  private getRemainingActionTime(): number {
    if (!this.actionTimer) return 0;
    
    const elapsedTime = (Date.now() - this.actionTimerStartTime) / 1000;
    return Math.max(0, this.actionTimeoutSeconds - elapsedTime);
  }

  // Update toJSON to include the timer information
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.map(p => p.toJSON()),
      communityCards: this.communityCards.filter(card => card !== undefined && card !== null).map(card => card.toString()),
      pot: this.pot,
      currentBet: this.currentBet,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      dealerPosition: this.dealerPosition,
      currentPlayerIndex: this.currentPlayerIndex,
      stage: this.stage,
      maxPlayers: this.maxPlayers,
      // Add remaining action time
      remainingActionTime: this.getRemainingActionTime()
    };
  }
}
