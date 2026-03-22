import {
  HCS10Client,
  AgentBuilder,
  AIAgentCapability,
  InboundTopicType,
} from '@hashgraphonline/standards-sdk';
import { PrivateKey } from '@hashgraph/sdk';
import { config } from '../config';

/**
 * Ensure the key is in DER-encoded hex format so the SDK can detect
 * the correct key type (ECDSA vs ED25519) instead of guessing wrong.
 */
function toDerHex(key: string): string {
  // If it's already DER-encoded, return as-is
  try {
    PrivateKey.fromStringDer(key);
    return key;
  } catch { /* not DER yet */ }
  // Raw hex — try ECDSA first, then ED25519, and return DER form
  try {
    return PrivateKey.fromStringECDSA(key).toStringDer();
  } catch { /* not ECDSA */ }
  return PrivateKey.fromStringED25519(key).toStringDer();
}

export function createHCS10Client(operatorId?: string, operatorKey?: string): HCS10Client {
  return new HCS10Client({
    network: 'testnet',
    operatorId: operatorId ?? config.hedera.operatorId,
    operatorPrivateKey: toDerHex(operatorKey ?? config.hedera.operatorKey),
    logLevel: 'warn',
  });
}

export async function registerAgent(cfg: {
  name: string;
  description: string;
  capability: string;
  agentType: 'dispatcher' | 'worker';
  taskName?: string;
  priceHbar?: number;
  slaSeconds?: number;
}): Promise<{
  accountId: string;
  privateKey: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
}> {
  const client = createHCS10Client();

  const capabilities =
    cfg.agentType === 'dispatcher'
      ? [
          AIAgentCapability.TEXT_GENERATION,
          AIAgentCapability.WORKFLOW_AUTOMATION,
          AIAgentCapability.MULTI_AGENT_COORDINATION,
        ]
      : [AIAgentCapability.TEXT_GENERATION, AIAgentCapability.KNOWLEDGE_RETRIEVAL];

  const agentBuilder = new AgentBuilder()
    .setName(cfg.name)
    .setDescription(cfg.description)
    .setAgentType('autonomous')
    .setCapabilities(capabilities)
    .setModel('claude-sonnet-4-20250514')
    .setNetwork('testnet')
    .setInboundTopicType(InboundTopicType.PUBLIC)
    .setMetadata({
      capability: cfg.capability,
      agentType: cfg.agentType,
      marketplace: 'agent-hiring-board',
      taskName: cfg.taskName ?? cfg.capability,
      priceHbar: cfg.priceHbar ?? 1.0,
      slaSeconds: cfg.slaSeconds ?? 120,
    });

  const result = await client.createAndRegisterAgent(agentBuilder, {
    progressCallback: (step: string) => console.log(`[${cfg.name}] ${step}`),
  });

  if (!result.success || !result.metadata) {
    throw new Error(`Failed to register agent: ${cfg.name}`);
  }

  return {
    accountId: result.metadata.accountId,
    privateKey: result.metadata.privateKey,
    inboundTopicId: result.metadata.inboundTopicId,
    outboundTopicId: result.metadata.outboundTopicId,
    profileTopicId: result.metadata.profileTopicId,
  };
}
