import { Card } from './Card';

export enum PlayerAction {
  FOLD = "fold",
  CHECK = "check",
  CALL = "call",
  BET = "bet",
  RAISE = "raise",
  ALL_IN = "all-in"
}

export class Player {
  id: string;
  name: string;
  chips: number;
  hand: Card[] = [];
  bet: number = 0;
  folded: boolean = false;
  isAllIn: boolean = false;
  isDealer: boolean = false;
  isSmallBlind: boolean = false;
  isBigBlind: boolean = false;
  isActive: boolean = false;
  isChecked: boolean = false;
  
  constructor(id: string, name: string, initialChips: number = 1000) {
    this.id = id;
    this.name = name;
    this.chips = initialChips;
  }

  resetHand(): void {
    this.hand = [];
    this.bet = 0;
    this.folded = false;
    this.isAllIn = false;
    this.isDealer = false;
    this.isSmallBlind = false;
    this.isBigBlind = false;
    this.isActive = false;
  }

  addCard(card: Card): void {
    this.hand.push(card);
  }

  placeBet(amount: number): number {
    const actualBet = Math.min(amount, this.chips);
    this.chips -= actualBet;
    this.bet += actualBet;
    
    if (this.chips === 0) {
      this.isAllIn = true;
    }
    
    return actualBet;
  }

  fold(): void {
    this.folded = true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      chips: this.chips,
      bet: this.bet,
      folded: this.folded,
      isAllIn: this.isAllIn,
      isDealer: this.isDealer,
      isSmallBlind: this.isSmallBlind,
      isBigBlind: this.isBigBlind,
      isActive: this.isActive,
      hand: this.hand.map(card => card.toString())
    };
  }
}