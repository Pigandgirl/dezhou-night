import catalog from '../server/shared/achievements.json';

export const HAND_TYPES = [
  { key: 'royalFlush', name: '皇家同花顺' },
  { key: 'straightFlush', name: '同花顺' },
  { key: 'fourOfKind', name: '四条' },
  { key: 'fullHouse', name: '葫芦' },
  { key: 'flush', name: '同花' },
  { key: 'straight', name: '顺子' },
  { key: 'threeOfKind', name: '三条' },
  { key: 'twoPair', name: '两对' },
  { key: 'onePair', name: '一对' },
  { key: 'highCard', name: '高牌' },
];

export const ACHIEVEMENTS = catalog.entries;
export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));
export const STAR_REWARDS = [0, 10, 20, 50, 100, 1000];

export function achievementFor(id) {
  return ACHIEVEMENT_BY_ID.get(id) || {
    id,
    title: id,
    category: '荣耀',
    star: 1,
    desc: '达成荣耀条件',
    quote: '这是一段属于你的牌桌传说。',
    rewardChips: 10,
  };
}

export function handTypeName(key) {
  return (HAND_TYPES.find((item) => item.key === key) || {}).name || key;
}
