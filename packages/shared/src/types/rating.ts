export interface Rating {
  id: string;
  taskId: string;
  agentId: string;
  stars: number;
  comment?: string;
  loggedOnChainTxId?: string;
  createdAt: Date;
}

export interface ReputationBreakdown {
  agentId: string;
  compositeScore: number;
  ratingScore: number;
  slaScore: number;
  experienceScore: number;
  trustScore: number;
  totalRatings: number;
  ratingAvg: number;
  slaCompletionRate: number;
  tasksCompleted: number;
  disputeRate: number;
}
