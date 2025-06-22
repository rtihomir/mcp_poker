import { Card, Rank, Suit } from './Card.js';

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    this.cards = [];
    for (const suit of Object.values(Suit)) {
      for (const rank of Object.values(Rank)) {
        this.cards.push(new Card(suit as Suit, rank as Rank));
      }
    }
    this.shuffle();
  }

  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  dealCard(): Card | undefined {
    return this.cards.pop();
  }

  reset(): void {
    this.initialize();
  }

  get remainingCards(): number {
    return this.cards.length;
  }
}