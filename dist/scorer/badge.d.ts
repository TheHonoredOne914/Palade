import type { BadgeColor, BadgeData } from './types.js';
export declare function getScoreColor(score: number): BadgeColor;
export declare function getBadgeData(score: number): BadgeData;
export declare function renderBadge(data: BadgeData): string;
