import {
  HCS10Client,
  AgentBuilder,
  AIAgentCapability,
  InboundTopicType,
} from '@hashgraphonline/standards-sdk';
import { PrivateKey } from '@hashgraph/sdk';
import { config } from '../config';

// HCS-10 SDK expects raw 32-byte hex key, not DER-encoded
function toRawHex(keyDerOrRaw: string): string {
  try {
    return PrivateKey.fromStringDer(keyDerOrRaw).toStringRaw();
  } catch {
    return keyDerOrRaw; // already raw
  }
}

export function createHCS10Client(operatorId?: string, operatorKey?: string): HCS10Client {
  return new HCS10Client({
    network: 'testnet',
    operatorId: operatorId ?? config.hedera.operatorId,
    operatorPrivateKey: toRawHex(operatorKey ?? config.hedera.operatorKey),
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

  if (!result.success) {
    throw new Error(`Failed to register agent: ${cfg.name}`);
  }

  return {
    accountId: result.metadata.accountId,
    inboundTopicId: result.metadata.inboundTopicId,
    outboundTopicId: result.metadata.outboundTopicId,
    profileTopicId: result.metadata.profileTopicId,
  };
}
