const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Users — Auth
export async function loginGoogle(code: string) {
  return apiFetch('/api/users/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

export async function loginEvm(data: {
  address: string;
  signature: string;
  timestamp: number;
  name?: string;
}) {
  return apiFetch('/api/users/login-evm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getPlatformConfig() {
  return apiFetch('/api/users/platform-config');
}

export async function getUserBalance(userId: string) {
  return apiFetch(`/api/users/${userId}/balance`);
}

export async function getWalletBalance(userId: string) {
  return apiFetch(`/api/users/${userId}/wallet-balance`);
}

// Deposits
export async function initiateDeposit(userId: string, amount: number) {
  return apiFetch(`/api/users/${userId}/deposit/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
}

export async function verifyDeposit(userId: string, transactionId: string) {
  return apiFetch(`/api/users/${userId}/deposit/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });
}

export async function confirmEvmDeposit(userId: string, txHash: string, amount: number, senderEvmAddress: string) {
  return apiFetch(`/api/users/${userId}/deposit/confirm-evm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, amount, senderEvmAddress }),
  });
}

// Google auth users: deposit by having the platform sign a transfer from their stored key.
// `confirmed` must be true — caller is responsible for showing a confirmation dialog first.
export async function depositGoogle(userId: string, amount: number) {
  return apiFetch(`/api/users/${userId}/deposit/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, confirmed: true }),
  });
}

export async function withdrawHbar(userId: string, amount: number) {
  return apiFetch(`/api/users/${userId}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
}

export async function getUserTransactions(userId: string) {
  return apiFetch(`/api/users/${userId}/transactions`);
}

// Tasks
export async function sendChatMessage(userId: string, message: string) {
  return apiFetch('/api/tasks/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message }),
  });
}

export async function createQuote(userId: string, message: string) {
  return apiFetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message }),
  });
}

export async function confirmTask(taskId: string, userId: string, agentId: string) {
  return apiFetch(`/api/tasks/${taskId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, agentId }),
  });
}

export async function getTask(id: string) {
  return apiFetch(`/api/tasks/${id}`);
}

export async function getTasks(params?: { status?: string; userId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.userId) qs.set('userId', params.userId);
  const query = qs.toString();
  return apiFetch(`/api/tasks${query ? `?${query}` : ''}`);
}

export async function verifyTask(id: string) {
  return apiFetch(`/api/tasks/${id}/verify`);
}

export async function rateTask(taskId: string, userId: string, stars: number, comment?: string) {
  return apiFetch(`/api/tasks/${taskId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, stars, comment }),
  });
}

export async function skipRating(taskId: string, userId: string) {
  return apiFetch(`/api/tasks/${taskId}/skip-rating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

// Agents
export async function getAgents() {
  return apiFetch('/api/agents');
}

export async function getAgent(id: string) {
  return apiFetch(`/api/agents/${id}`);
}

export async function getAgentReputation(id: string) {
  return apiFetch(`/api/agents/${id}/reputation`);
}

export async function registerAgent(data: {
  userId: string;
  agentName: string;
  apiUrl?: string;
  taskType: string;
  priceHbar: number;
  slaSeconds?: number;
  description?: string;
  exampleRequestBody?: any;
  requestFieldsConfig?: any;
  exampleResponseBody?: any;
  protocol?: 'api' | 'hcs10_managed' | 'hcs10_self';
  accountId?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
}) {
  return apiFetch('/api/agents/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getAgentConnectionStatus(agentId: string) {
  return apiFetch(`/api/agents/${agentId}/connection-status`);
}

export async function completeAgentConnection(agentId: string) {
  return apiFetch(`/api/agents/${agentId}/complete-connection`, {
    method: 'POST',
  });
}

export async function updateAgent(agentId: string, data: {
  userId: string;
  agentName?: string;
  apiUrl?: string;
  taskType?: string;
  priceHbar?: number;
  slaSeconds?: number;
  description?: string;
  exampleRequestBody?: any;
  requestFieldsConfig?: any;
  exampleResponseBody?: any;
}) {
  return apiFetch(`/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function provideTaskInputs(taskId: string, userId: string, message: string) {
  return apiFetch(`/api/tasks/${taskId}/provide-inputs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message }),
  });
}
