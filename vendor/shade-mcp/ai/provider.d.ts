interface AIProvider {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model: string;
}
interface CallAIOptions {
    system: string;
    userContent: Array<{
        type: string;
        text?: string;
        image_url?: {
            url: string;
        };
    }>;
    maxTokens?: number;
    jsonMode?: boolean;
    ai: AIProvider;
}
declare function getAIProvider(options: {
    projectRoot: string;
}): AIProvider | null;
declare function callAI(options: CallAIOptions): Promise<string | null>;
declare const NO_AI_KEY_MESSAGE = "No AI API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or create .anthropic/.openai file in project root.";

export { type AIProvider, type CallAIOptions, NO_AI_KEY_MESSAGE, callAI, getAIProvider };
