import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
  }
}

loadEnv();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const platformFeePercent = 0.05;

export const config = {
  databaseUrl: required('DATABASE_URL'),
  hedera: {
    network: optional('HEDERA_NETWORK', 'testnet'),
    operatorId: required('HEDERA_OPERATOR_ID'),
    operatorKey: required('HEDERA_OPERATOR_KEY'),
  },
  groq: {
    apiKey: required('GROQ_API_KEY'),
  },
  agents: {
    dispatcher: {
      accountId: optional('DISPATCHER_ACCOUNT_ID'),
      inboundTopicId: optional('DISPATCHER_INBOUND_TOPIC_ID'),
      outboundTopicId: optional('DISPATCHER_OUTBOUND_TOPIC_ID'),
    },
    summarizer: {
      accountId: optional('SUMMARIZER_ACCOUNT_ID'),
      inboundTopicId: optional('SUMMARIZER_INBOUND_TOPIC_ID'),
      outboundTopicId: optional('SUMMARIZER_OUTBOUND_TOPIC_ID'),
    },
    contentGen: {
      accountId: optional('CONTENT_GEN_ACCOUNT_ID'),
      inboundTopicId: optional('CONTENT_GEN_INBOUND_TOPIC_ID'),
      outboundTopicId: optional('CONTENT_GEN_OUTBOUND_TOPIC_ID'),
    },
  },
  connections: {
    dispatcherSummarizer: optional('DISPATCHER_SUMMARIZER_CONNECTION'),
    dispatcherContentGen: optional('DISPATCHER_CONTENT_GEN_CONNECTION'),
  },
  topics: {
    escrow: optional('ESCROW_TOPIC_ID'),
    receipt: optional('RECEIPT_TOPIC_ID'),
    reputation: optional('REPUTATION_TOPIC_ID'),
    rating: optional('RATING_TOPIC_ID'),
  },
  api: {
    port: parseInt(optional('PORT', '') || optional('API_PORT', '3001')),
  },
};
