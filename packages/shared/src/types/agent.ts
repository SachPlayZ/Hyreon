export type AgentType = 'DISPATCHER' | 'WORKER';

export type AgentCapability = 'orchestration' | 'summarization' | 'content_generation';

export interface AgentProfile {
  id: string;
  name: string;
  type: AgentType;
  capability?: string;
  accountId?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
  status: string;
  rateHbar: number;
  tasksCompleted: number;
  taskName?: string;
  slaSeconds: number;
  description?: string;
  apiUrl?: string;
  walletId?: string;
  version: string;
  isThirdParty: boolean;
  ownerId?: string | null;
  reputationScore: number;
  ratingAvg: number;
  slaCompletionRate: number;
  totalRatings: number;
  disputeRate: number;
  createdAt: Date;
  updatedAt: Date;
}
