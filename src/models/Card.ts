export enum Suit {
  HEARTS = "hearts",
  DIAMONDS = "diamonds",
  CLUBS = "clubs",
  SPADES = "spades"
}

export enum Rank {
  TWO = "2",
  THREE = "3",
  FOUR = "4",
  FIVE = "5",
  SIX = "6",
  SEVEN = "7",
  EIGHT = "8",
  NINE = "9",
  TEN = "10",
  JACK = "J",
  QUEEN = "Q",
  KING = "K",
  ACE = "A"
}

export class Card {
  constructor(public suit: Suit, public rank: Rank) {}

  toString(): string {
    return `${this.rank}${this.suit.charAt(0).toUpperCase()}`;
  }
}