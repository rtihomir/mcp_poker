import { Card, Rank, Suit } from '../models/Card';

export enum HandRank {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9
}

export interface HandResult {
  rank: HandRank;
  cards: Card[];
  description: string;
}

export class HandEvaluator {
  private static readonly RANK_VALUES: Record<Rank, number> = {
    [Rank.TWO]: 2,
    [Rank.THREE]: 3,
    [Rank.FOUR]: 4,
    [Rank.FIVE]: 5,
    [Rank.SIX]: 6,
    [Rank.SEVEN]: 7,
    [Rank.EIGHT]: 8,
    [Rank.NINE]: 9,
    [Rank.TEN]: 10,
    [Rank.JACK]: 11,
    [Rank.QUEEN]: 12,
    [Rank.KING]: 13,
    [Rank.ACE]: 14
  };

  static evaluateHand(playerCards: Card[], communityCards: Card[]): HandResult {
    const allCards = [...playerCards, ...communityCards];
    
    // Check for royal flush
    const royalFlush = this.checkRoyalFlush(allCards);
    if (royalFlush) return royalFlush;
    
    // Check for straight flush
    const straightFlush = this.checkStraightFlush(allCards);
    if (straightFlush) return straightFlush;
    
    // Check for four of a kind
    const fourOfAKind = this.checkFourOfAKind(allCards);
    if (fourOfAKind) return fourOfAKind;
    
    // Check for full house
    const fullHouse = this.checkFullHouse(allCards);
    if (fullHouse) return fullHouse;
    
    // Check for flush
    const flush = this.checkFlush(allCards);
    if (flush) return flush;
    
    // Check for straight
    const straight = this.checkStraight(allCards);
    if (straight) return straight;
    
    // Check for three of a kind
    const threeOfAKind = this.checkThreeOfAKind(allCards);
    if (threeOfAKind) return threeOfAKind;
    
    // Check for two pair
    const twoPair = this.checkTwoPair(allCards);
    if (twoPair) return twoPair;
    
    // Check for pair
    const pair = this.checkPair(allCards);
    if (pair) return pair;
    
    // High card
    return this.getHighCard(allCards);
  }

  private static checkRoyalFlush(cards: Card[]): HandResult | null {
    // Group cards by suit
    const suitGroups = this.groupBySuit(cards);
    
    for (const suit in suitGroups) {
      const suitCards = suitGroups[suit];
      if (suitCards.length >= 5) {
        const royalCards = suitCards.filter(card => 
          card.rank === Rank.TEN || 
          card.rank === Rank.JACK || 
          card.rank === Rank.QUEEN || 
          card.rank === Rank.KING || 
          card.rank === Rank.ACE
        );
        
        if (royalCards.length === 5) {
          return {
            rank: HandRank.ROYAL_FLUSH,
            cards: royalCards,
            description: `Royal Flush of ${suit}`
          };
        }
      }
    }
    
    return null;
  }

  private static checkStraightFlush(cards: Card[]): HandResult | null {
    // Group cards by suit
    const suitGroups = this.groupBySuit(cards);
    
    for (const suit in suitGroups) {
      const suitCards = suitGroups[suit];
      if (suitCards.length >= 5) {
        const sortedCards = [...suitCards].sort((a, b) => 
          this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]
        );
        
        const straight = this.findStraight(sortedCards);
        if (straight) {
          return {
            rank: HandRank.STRAIGHT_FLUSH,
            cards: straight,
            description: `Straight Flush, ${straight[0].rank} high`
          };
        }
      }
    }
    
    return null;
  }

  private static checkFourOfAKind(cards: Card[]): HandResult | null {
    // Group cards by rank
    const rankGroups = this.groupByRank(cards);
    
    for (const rank in rankGroups) {
      const rankCards = rankGroups[rank];
      if (rankCards.length === 4) {
        // Find the highest kicker
        const kickers = cards.filter(card => card.rank !== rank)
          .sort((a, b) => this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]);
        
        return {
          rank: HandRank.FOUR_OF_A_KIND,
          cards: [...rankCards, kickers[0]],
          description: `Four of a Kind, ${rank}s`
        };
      }
    }
    
    return null;
  }

  private static checkFullHouse(cards: Card[]): HandResult | null {
    // Group cards by rank
    const rankGroups = this.groupByRank(cards);
    
    let threeOfAKindRank: string | null = null;
    let pairRank: string | null = null;
    
    // Find the highest three of a kind
    for (const rank in rankGroups) {
      if (rankGroups[rank].length >= 3) {
        if (!threeOfAKindRank || this.RANK_VALUES[rank as Rank] > this.RANK_VALUES[threeOfAKindRank as Rank]) {
          threeOfAKindRank = rank;
        }
      }
    }
    
    if (!threeOfAKindRank) return null;
    
    // Find the highest pair that's not the same rank as the three of a kind
    for (const rank in rankGroups) {
      if (rank !== threeOfAKindRank && rankGroups[rank].length >= 2) {
        if (!pairRank || this.RANK_VALUES[rank as Rank] > this.RANK_VALUES[pairRank as Rank]) {
          pairRank = rank;
        }
      }
    }
    
    if (!pairRank) return null;
    
    return {
      rank: HandRank.FULL_HOUSE,
      cards: [
        ...rankGroups[threeOfAKindRank].slice(0, 3),
        ...rankGroups[pairRank].slice(0, 2)
      ],
      description: `Full House, ${threeOfAKindRank}s full of ${pairRank}s`
    };
  }

  private static checkFlush(cards: Card[]): HandResult | null {
    // Group cards by suit
    const suitGroups = this.groupBySuit(cards);
    
    for (const suit in suitGroups) {
      const suitCards = suitGroups[suit];
      if (suitCards.length >= 5) {
        const sortedCards = [...suitCards].sort((a, b) => 
          this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]
        );
        
        return {
          rank: HandRank.FLUSH,
          cards: sortedCards.slice(0, 5),
          description: `Flush, ${sortedCards[0].rank} high`
        };
      }
    }
    
    return null;
  }

  private static checkStraight(cards: Card[]): HandResult | null {
    const uniqueRankCards = this.getUniqueRankCards(cards);
    const sortedCards = [...uniqueRankCards].sort((a, b) => 
      this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]
    );
    
    const straight = this.findStraight(sortedCards);
    if (straight) {
      return {
        rank: HandRank.STRAIGHT,
        cards: straight,
        description: `Straight, ${straight[0].rank} high`
      };
    }
    
    return null;
  }

  private static checkThreeOfAKind(cards: Card[]): HandResult | null {
    // Group cards by rank
    const rankGroups = this.groupByRank(cards);
    
    for (const rank in rankGroups) {
      const rankCards = rankGroups[rank];
      if (rankCards.length === 3) {
        // Find the two highest kickers
        const kickers = cards.filter(card => card.rank !== rank)
          .sort((a, b) => this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]);
        
        return {
          rank: HandRank.THREE_OF_A_KIND,
          cards: [...rankCards, kickers[0], kickers[1]],
          description: `Three of a Kind, ${rank}s`
        };
      }
    }
    
    return null;
  }

  private static checkTwoPair(cards: Card[]): HandResult | null {
    // Group cards by rank
    const rankGroups = this.groupByRank(cards);
    
    const pairs: Card[][] = [];
    
    for (const rank in rankGroups) {
      const rankCards = rankGroups[rank];
      if (rankCards.length >= 2) {
        pairs.push(rankCards.slice(0, 2));
      }
    }
    
    if (pairs.length >= 2) {
      // Sort pairs by rank
      pairs.sort((a, b) => 
        this.RANK_VALUES[b[0].rank] - this.RANK_VALUES[a[0].rank]
      );
      
      // Take the two highest pairs
      const topTwoPairs = pairs.slice(0, 2).flat();
      
      // Find the highest kicker
      const kickers = cards.filter(card => 
        card.rank !== topTwoPairs[0].rank && card.rank !== topTwoPairs[2].rank
      ).sort((a, b) => this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]);
      
      return {
        rank: HandRank.TWO_PAIR,
        cards: [...topTwoPairs, kickers[0]],
        description: `Two Pair, ${topTwoPairs[0].rank}s and ${topTwoPairs[2].rank}s`
      };
    }
    
    return null;
  }

  private static checkPair(cards: Card[]): HandResult | null {
    // Group cards by rank
    const rankGroups = this.groupByRank(cards);
    
    for (const rank in rankGroups) {
      const rankCards = rankGroups[rank];
      if (rankCards.length === 2) {
        // Find the three highest kickers
        const kickers = cards.filter(card => card.rank !== rank)
          .sort((a, b) => this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]);
        
        return {
          rank: HandRank.PAIR,
          cards: [...rankCards, kickers[0], kickers[1], kickers[2]],
          description: `Pair of ${rank}s`
        };
      }
    }
    
    return null;
  }

  private static getHighCard(cards: Card[]): HandResult {
    const sortedCards = [...cards].sort((a, b) => 
      this.RANK_VALUES[b.rank] - this.RANK_VALUES[a.rank]
    );
    
    return {
      rank: HandRank.HIGH_CARD,
      cards: sortedCards.slice(0, 5),
      description: `High Card, ${sortedCards[0].rank}`
    };
  }

  private static groupBySuit(cards: Card[]): Record<string, Card[]> {
    const groups: Record<string, Card[]> = {};
    
    for (const card of cards) {
      if (!groups[card.suit]) {
        groups[card.suit] = [];
      }
      groups[card.suit].push(card);
    }
    
    return groups;
  }

  private static groupByRank(cards: Card[]): Record<string, Card[]> {
    const groups: Record<string, Card[]> = {};
    
    for (const card of cards) {
      if (!groups[card.rank]) {
        groups[card.rank] = [];
      }
      groups[card.rank].push(card);
    }
    
    return groups;
  }

  private static findStraight(sortedCards: Card[]): Card[] | null {
    if (sortedCards.length < 5) return null;
    
    // Check for A-5-4-3-2 straight
    if (sortedCards[0].rank === Rank.ACE) {
      const lowAceStraight = sortedCards.filter(card => 
        card.rank === Rank.ACE || 
        card.rank === Rank.TWO || 
        card.rank === Rank.THREE || 
        card.rank === Rank.FOUR || 
        card.rank === Rank.FIVE
      );
      
      if (lowAceStraight.length >= 5) {
        // Reorder for A-5-4-3-2 (with Ace at the end)
        return [
          lowAceStraight.find(card => card.rank === Rank.FIVE)!,
          lowAceStraight.find(card => card.rank === Rank.FOUR)!,
          lowAceStraight.find(card => card.rank === Rank.THREE)!,
          lowAceStraight.find(card => card.rank === Rank.TWO)!,
          lowAceStraight.find(card => card.rank === Rank.ACE)!
        ];
      }
    }
    
    // Check for regular straight
    const straight: Card[] = [sortedCards[0]];
    
    for (let i = 1; i < sortedCards.length; i++) {
      const prevRankValue = this.RANK_VALUES[sortedCards[i-1].rank];
      const currRankValue = this.RANK_VALUES[sortedCards[i].rank];
      
      if (prevRankValue - currRankValue === 1) {
        straight.push(sortedCards[i]);
        if (straight.length === 5) {
          return straight;
        }
      } else if (prevRankValue !== currRankValue) {
        // Reset if not consecutive and not the same rank
        straight.length = 1;
        straight[0] = sortedCards[i];
      }
    }
    
    return null;
  }

  private static getUniqueRankCards(cards: Card[]): Card[] {
    const uniqueRanks = new Set<string>();
    const uniqueCards: Card[] = [];
    
    for (const card of cards) {
      if (!uniqueRanks.has(card.rank)) {
        uniqueRanks.add(card.rank);
        uniqueCards.push(card);
      }
    }
    
    return uniqueCards;
  }

  static compareHands(hand1: HandResult, hand2: HandResult): number {
    // Compare hand ranks first
    if (hand1.rank !== hand2.rank) {
      return hand1.rank - hand2.rank;
    }
    
    // If ranks are the same, compare cards in order
    for (let i = 0; i < Math.min(hand1.cards.length, hand2.cards.length); i++) {
      const card1Value = this.RANK_VALUES[hand1.cards[i].rank];
      const card2Value = this.RANK_VALUES[hand2.cards[i].rank];
      
      if (card1Value !== card2Value) {
        return card1Value - card2Value;
      }
    }
    
    // Hands are identical
    return 0;
  }
}