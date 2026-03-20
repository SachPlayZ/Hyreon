import { RegistryBrokerClient } from '@hashgraphonline/standards-sdk';

export async function discoverWorkers(
  capability: string
): Promise<
  Array<{
    accountId: string;
    name: string;
    inboundTopicId: string;
    capability: string;
    priceHbar: number;
    slaSeconds: number;
    taskName: string;
  }>
> {
  const broker = new RegistryBrokerClient({});

  const results = await broker.search({
    q: `agent-hiring-board ${capability}`,
    capabilities: [0],
    limit: 10,
  });

  return (results.hits as any[])
    .filter((hit: any) => hit.metadata?.marketplace === 'agent-hiring-board')
    .filter((hit: any) => hit.metadata?.capability === capability)
    .map((hit: any) => ({
      accountId: hit.accountId,
      name: hit.profile?.display_name || 'Unknown',
      inboundTopicId: hit.profile?.inboundTopicId,
      capability: hit.metadata?.capability,
      priceHbar: hit.metadata?.priceHbar ?? 1.0,
      slaSeconds: hit.metadata?.slaSeconds ?? 120,
      taskName: hit.metadata?.taskName ?? capability,
    }));
}
