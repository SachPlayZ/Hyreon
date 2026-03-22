import { ChatOpenAI } from '@langchain/openai';
import { BaseWorker } from './base-worker';
import { config } from '../config';

export class ContentGenWorker extends BaseWorker {
  name = 'ContentGenBot';
  capability = 'content_generation';
  taskName = 'content_generation';
  slaSeconds = 180;
  priceHbar = 2.0;

  private llm = new ChatOpenAI({
    model: 'gpt-5.1',
    apiKey: config.openai.apiKey,
  });

  async executeTask(payload: string): Promise<string> {
    const response = await this.llm.invoke([
      {
        role: 'system',
        content:
          'You are an expert content generator specializing in blog posts, marketing copy, social media content, ' +
          'product descriptions, email campaigns, and creative writing. Produce high-quality, engaging content ' +
          "tailored to the user's specific needs. Structure your output clearly with appropriate headings, " +
          'paragraphs, and formatting.',
      },
      { role: 'user', content: payload },
    ]);
    return response.content as string;
  }
}
