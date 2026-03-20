export type TaskStatus =
  | 'PENDING'
  | 'CLASSIFYING'
  | 'QUOTING'
  | 'AWAITING_CONFIRMATION'
  | 'HIRING'
  | 'ESCROW_CREATED'
  | 'IN_PROGRESS'
  | 'GATHERING_INPUTS'
  | 'RATING_WINDOW'
  | 'COMPLETED'
  | 'ESCROW_RELEASED'
  | 'FAILED'
  | 'REFUNDED';

export type TaskType = 'SUMMARIZATION' | 'CONTENT_GENERATION';

export interface Task {
  id: string;
  userMessage: string;
  classifiedType?: TaskType;
  status: TaskStatus;
  userId?: string;
  assignedWorkerId?: string;
  escrowAmountHbar?: number;
  escrowTxId?: string;
  releaseTxId?: string;
  resultText?: string;
  resultHash?: string;
  receiptTopicId?: string;
  receiptSequenceNumber?: number;
  connectionTopicId?: string;
  slaDeadline?: Date;
  slaMet?: boolean;
  platformFeeHbar?: number;
  userRating?: number;
  userComment?: string;
  ratingWindowClosesAt?: Date;
  quoteData?: any;
  requestBody?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteAgent {
  agent_id: string;
  name: string;
  price_hbar: number;
  sla_seconds: number;
  rating_avg: number;
  reputation_score: number;
  tasks_completed: number;
  is_third_party?: boolean;
  description?: string;
  relevance_score?: number;
  relevance_reasoning?: string;
}

export interface QuoteResult {
  taskId: string;
  classifiedType?: TaskType;
  agents: QuoteAgent[];
  userBalance: number;
}
