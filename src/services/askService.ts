import { BharatApexState } from '../context';
import { AskResponse } from '../../api/ask';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  calledTools?: Array<{
    name: string;
    args: Record<string, any>;
    result: any;
  }>;
}

export async function sendAskPlantQuery(
  message: string,
  history: ChatMessage[],
  state: BharatApexState
): Promise<AskResponse> {
  try {
    const formattedHistory = history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      text: m.text,
    }));

    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        history: formattedHistory,
        state: {
          customerBuffers: state.customerBuffers,
          trucks: state.trucks,
          bomItems: state.bomItems,
          machines: state.machines,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 413) {
        return {
          isConfigured: false,
          answer: 'Message payload too large (exceeds 100 kB limit).',
        };
      }
      return {
        isConfigured: false,
        answer: `Telemetry query failed with HTTP ${response.status}.`,
      };
    }

    const data: AskResponse = await response.json();
    return data;
  } catch (error: any) {
    console.warn('[sendAskPlantQuery Error]:', error);
    return {
      isConfigured: false,
      answer: "Add GEMINI_API_KEY to .env to enable the 'Ask the Plant' AI assistant.",
      calledTools: [],
    };
  }
}
