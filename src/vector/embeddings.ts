/**
 * Embedding Providers
 *
 * Ported from Nat-s-Agents data-aware-rag.
 * ChromaDB handles embeddings internally; other stores need these.
 */

import type { EmbeddingProvider, EmbeddingProviderType } from './types.ts';

/**
 * Placeholder for ChromaDB's internal embeddings.
 * ChromaDB generates embeddings server-side — this is never called directly.
 */
export class ChromaDBInternalEmbeddings implements EmbeddingProvider {
  readonly name = 'chromadb-internal';
  readonly dimensions = 384; // all-MiniLM-L6-v2 default

  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error('ChromaDB handles embeddings internally. Use addDocuments() directly.');
  }
}

/**
 * Ollama local embeddings
 */
export class OllamaEmbeddings implements EmbeddingProvider {
  readonly name = 'ollama';
  dimensions: number;
  private baseUrl: string;
  private model: string;
  private _dimensionsDetected = false;

  constructor(config: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config.model || process.env.ORACLE_EMBEDDING_MODEL || 'nomic-embed-text';
    // Known model dimensions (fallback before auto-detect)
    const KNOWN_DIMS: Record<string, number> = {
      'nomic-embed-text': 768,
      'qwen3-embedding': 4096,
      'bge-m3': 1024,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
    };
    this.dimensions = KNOWN_DIMS[this.model] || 768;
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Preprocess: pad short texts, truncate long texts
    const prepared = texts.map(text => {
      let input = text.trim();
      if (input.length < 10) input = input.padEnd(10, '.');
      return input.length > 2000 ? input.slice(0, 2000) : input;
    });

    // Batch embed via /api/embed (array input, ~3x faster than single /api/embeddings)
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: prepared }),
      });

      if (!response.ok) {
        const error = await response.text();
        if (error.includes('NaN') || error.includes('unsupported value')) {
          console.error(`[Embed] NaN in batch (${prepared.length} texts), falling back to single mode`);
          return this.embedSingle(prepared);
        }
        throw new Error(`Ollama API error: ${error}`);
      }

      const data = await response.json() as { embeddings: number[][] };

      // Auto-detect dimensions from first response
      if (!this._dimensionsDetected && data.embeddings.length > 0 && data.embeddings[0].length > 0) {
        this.dimensions = data.embeddings[0].length;
        this._dimensionsDetected = true;
      }

      // Replace any NaN values with 0
      return data.embeddings.map(emb => emb.map(v => Number.isNaN(v) ? 0 : v));
    } catch (e) {
      if (e instanceof Error && e.message.includes('Ollama API error')) throw e;
      console.error(`[Embed] Batch failed, falling back to single mode: ${e instanceof Error ? e.message : e}`);
      return this.embedSingle(prepared);
    }
  }

  /** Fallback: embed one text at a time (slower but handles NaN per-doc) */
  private async embedSingle(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: text }),
        });

        if (!response.ok) {
          const error = await response.text();
          if (error.includes('NaN') || error.includes('unsupported value')) {
            console.error(`[Embed] NaN for text (${text.length} chars), using zero vector`);
            embeddings.push(new Array(this.dimensions).fill(0));
            continue;
          }
          throw new Error(`Ollama API error: ${error}`);
        }

        const data = await response.json() as { embedding: number[] };
        const cleaned = data.embedding.map(v => Number.isNaN(v) ? 0 : v);
        embeddings.push(cleaned);

        if (!this._dimensionsDetected && cleaned.length > 0) {
          this.dimensions = cleaned.length;
          this._dimensionsDetected = true;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Ollama API error')) throw e;
        console.error(`[Embed] Failed: ${e instanceof Error ? e.message : e}`);
        embeddings.push(new Array(this.dimensions).fill(0));
      }
    }

    return embeddings;
  }
}

/**
 * OpenAI embeddings via API
 */
export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(config: { apiKey?: string; model?: string } = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = this.model === 'text-embedding-3-large' ? 3072 : 1536;

    if (!this.apiKey) {
      throw new Error('OpenAI API key required. Set OPENAI_API_KEY.');
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as {
      data: { embedding: number[]; index: number }[];
    };

    return data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }
}

/**
 * Create embedding provider from type string
 */
export function createEmbeddingProvider(
  type: EmbeddingProviderType = 'chromadb-internal',
  model?: string
): EmbeddingProvider {
  switch (type) {
    case 'ollama':
      return new OllamaEmbeddings({ model });
    case 'openai':
      return new OpenAIEmbeddings({ model });
    case 'cloudflare-ai': {
      // Dynamic import to avoid requiring CF credentials when not used
      const { CloudflareAIEmbeddings } = require('./adapters/cloudflare-vectorize.ts');
      return new CloudflareAIEmbeddings({ model });
    }
    case 'chromadb-internal':
    default:
      return new ChromaDBInternalEmbeddings();
  }
}
