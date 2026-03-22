import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { config } from '../config';
import { getPrismaClient } from '@repo/database';

const prisma = getPrismaClient();

// ── Intent detection: is this a task request or just conversation? ──

export type UserIntent = 'task' | 'conversation';

export async function detectIntent(userMessage: string): Promise<UserIntent> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  // Fetch available agent names/descriptions so the LLM knows what tasks are possible
  const agents = await prisma.agent.findMany({
    where: { type: 'WORKER', status: 'active' },
    select: { name: true, taskName: true, description: true },
  });
  const agentList = agents.length > 0
    ? agents.map((a) => `- ${a.name}: ${a.taskName ?? a.description ?? 'general task'}`).join('\n')
    : '(no agents currently available)';

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'You determine whether a user message is a TASK REQUEST (wanting to hire an AI agent to do work) or CONVERSATION (greeting, question about the platform, small talk, etc.).\n\n' +
        `Available agents on this platform:\n${agentList}\n\n` +
        'Respond with ONLY one word: "task" or "conversation".\n' +
        'Examples of TASK: "Summarize this article...", "Write me a blog post about...", "Generate a logo for...", "I need help writing..."\n' +
        'Examples of CONVERSATION: "Hi", "Hello", "What can you do?", "How does this work?", "Thanks", "Who are you?", "What agents are available?"',
    },
    { role: 'user', content: userMessage },
  ]);

  const answer = (response.content as string).trim().toLowerCase();
  return answer.includes('task') ? 'task' : 'conversation';
}

export async function generateConversationalReply(userMessage: string): Promise<string> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  const agents = await prisma.agent.findMany({
    where: { type: 'WORKER', status: 'active' },
    select: { name: true, taskName: true, description: true, rateHbar: true },
  });
  const agentList = agents.length > 0
    ? agents.map((a) => `- **${a.name}**: ${a.taskName ?? a.description ?? 'general task'} (${a.rateHbar} ℏ)`).join('\n')
    : 'No agents are currently registered.';

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'You are the Hyreon Dispatcher, an AI assistant on a decentralized agent marketplace powered by Hedera. ' +
        'Users can hire AI agents to complete tasks like summarization, content generation, and more. ' +
        'You respond in a friendly, concise way. Use markdown for formatting when helpful.\n\n' +
        `Available agents:\n${agentList}\n\n` +
        'If the user asks what you can do or what agents are available, describe the agents listed above. ' +
        'If they greet you, greet them back warmly and briefly explain what the platform does. ' +
        'Keep responses short (2-4 sentences max). Do not make up capabilities that are not listed.',
    },
    { role: 'user', content: userMessage },
  ]);

  return response.content as string;
}

const ClassificationSchema = z.object({
  type: z.enum(['summarization', 'content_generation']),
  confidence: z.number(),
  reasoning: z.string(),
});

export type Classification = z.infer<typeof ClassificationSchema>;

// Legacy classifier for platform agents (summarization / content_generation)
export async function classifyTask(userMessage: string): Promise<Classification> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'Classify the user task. Respond with ONLY valid JSON: { "type": "summarization" or "content_generation", "confidence": 0.0-1.0, "reasoning": "brief explanation" }. ' +
        'Use "summarization" for tasks asking to summarize, condense, or extract key points from text. ' +
        'Use "content_generation" for tasks asking to write, create, generate, or produce content such as blog posts, marketing copy, social media posts, emails, or creative writing.',
    },
    { role: 'user', content: userMessage },
  ]);

  const content = response.content as string;
  const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
  return ClassificationSchema.parse(parsed);
}

// Semantic agent matching — scores all agents by relevance to the user's request
export interface AgentMatch {
  agentId: string;
  relevanceScore: number;
  reasoning: string;
}

export async function matchAgents(
  userMessage: string,
  agents: Array<{ id: string; name: string; description: string | null; taskName: string | null; capability: string | null }>
): Promise<AgentMatch[]> {
  if (agents.length === 0) return [];

  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  const agentList = agents
    .map((a, i) => `${i + 1}. ID: "${a.id}" | Name: "${a.name}" | Task: "${a.taskName ?? a.capability ?? ''}" | Description: "${a.description ?? 'No description'}"`)
    .join('\n');

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'You are a task router for an AI agent marketplace. The user has a request. ' +
        'Score each agent\'s relevance (0.0 to 1.0) to the user\'s request based on their description and task type. ' +
        'Respond with ONLY valid JSON array: [{ "agentId": "...", "relevanceScore": 0.0-1.0, "reasoning": "brief explanation" }]. ' +
        'Include ALL agents in the response. Be strict — only give high scores (>0.6) to agents whose description clearly matches the request.',
    },
    {
      role: 'user',
      content: `User request: "${userMessage}"\n\nAvailable agents:\n${agentList}`,
    },
  ]);

  const content = response.content as string;
  const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());

  return (parsed as AgentMatch[])
    .filter((m) => m.relevanceScore >= 0.3)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Extract field values from natural language using the agent's example request schema
export async function extractFieldsFromMessage(
  userMessage: string,
  exampleRequestBody: any,
  requestFieldsConfig: Record<string, { required: boolean }>
): Promise<{ extracted: any; missing: string[] }> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  const fields = Object.entries(requestFieldsConfig)
    .map(([k, v]) => `  "${k}": ${v.required ? 'REQUIRED' : 'optional'}`)
    .join('\n');

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'Extract values from the user\'s message to fill a JSON request body. ' +
        'Respond with ONLY valid JSON matching the schema. Use null for fields the user did not provide.\n\n' +
        `Example request format:\n${JSON.stringify(exampleRequestBody, null, 2)}\n\n` +
        `Field requirements:\n${fields}`,
    },
    { role: 'user', content: userMessage },
  ]);

  const content = response.content as string;
  const extracted = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());

  // Check which required fields are missing
  const missing = Object.entries(requestFieldsConfig)
    .filter(([k, v]) => v.required && (extracted[k] === null || extracted[k] === undefined || extracted[k] === ''))
    .map(([k]) => k);

  return { extracted, missing };
}

// Format a JSON response into natural language for the user
export async function formatResponseForUser(
  responseJson: any,
  exampleResponseBody: any | null,
  agentName: string
): Promise<string> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'You are presenting an AI agent\'s response to a user. ' +
        'Convert the response into clear, friendly, natural language using Markdown formatting. Be concise but thorough. ' +
        'Do not mention JSON or technical details — just present the information naturally. ' +
        'IMPORTANT: If the response contains URLs or links, always preserve them as clickable Markdown links like [descriptive text](url). ' +
        'Use bullet points, bold text, and other Markdown formatting where appropriate to make the response easy to read. ' +
        `The response came from an agent called "${agentName}".` +
        (exampleResponseBody ? `\n\nExpected response format for context:\n${JSON.stringify(exampleResponseBody, null, 2)}` : ''),
    },
    {
      role: 'user',
      content: `Agent response:\n${typeof responseJson === 'string' ? responseJson : JSON.stringify(responseJson, null, 2)}`,
    },
  ]);

  return response.content as string;
}

// Generate a natural language question asking the user for required fields
export async function generateInputQuestion(
  exampleRequestBody: any,
  requestFieldsConfig: Record<string, { required: boolean }>,
  agentName: string,
  agentDescription: string | null
): Promise<string> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: config.openai.apiKey,
  });

  const required = Object.entries(requestFieldsConfig).filter(([, v]) => v.required).map(([k]) => k);
  const optional = Object.entries(requestFieldsConfig).filter(([, v]) => !v.required).map(([k]) => k);

  const response = await llm.invoke([
    {
      role: 'system',
      content:
        'You are a dispatcher helping a user provide inputs for an AI agent. ' +
        'Ask the user to provide the required information in a friendly, conversational way. ' +
        'Mention what each field is for based on its name. List required fields clearly. ' +
        'If there are optional fields, briefly mention them at the end. ' +
        'Do NOT use JSON or technical formatting — speak naturally.',
    },
    {
      role: 'user',
      content:
        `Agent: "${agentName}"${agentDescription ? ` — ${agentDescription}` : ''}\n` +
        `Example request format: ${JSON.stringify(exampleRequestBody, null, 2)}\n` +
        `Required fields: ${required.join(', ')}\n` +
        `Optional fields: ${optional.length ? optional.join(', ') : 'none'}`,
    },
  ]);

  return response.content as string;
}
