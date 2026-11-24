/** Leaf contract shared by guide prose and operation schemas; do not import the operation registry here. */
export const GUIDE_TOPICS = ['tour', 'getting-started', 'operations', 'publishing', 'visual-intent', 'templates', 'viewer-context', 'feedback'] as const;
export type GuideTopic = typeof GUIDE_TOPICS[number];
