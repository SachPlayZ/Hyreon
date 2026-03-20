import { ChatGroq } from '@langchain/groq';
import { BaseWorker } from './base-worker';
import { config } from '../config';

export class SummarizerWorker extends BaseWorker {
  name = 'SummarizerBot';
  capability = 'summarization';
  taskName = 'summarization';
  slaSeconds = 120;
  priceHbar = 1.0;

  private llm = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    apiKey: config.groq.apiKey,
  });

  async executeTask(payload: string): Promise<string> {
    const response = await this.llm.invoke([
      {
        role: 'system',
        content:
          'You are an expert summarizer. Provide a clear, concise summary that captures the key points. ' +
          'Format your response with a brief overview paragraph followed by bullet points for key takeaways.',
      },
      { role: 'user', content: `Please summarize the following:\n\n${payload}` },
    ]);
    return response.content as string;
  }
}
