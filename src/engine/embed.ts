import { readSecret } from "@/lib/env";

/**
 * Voyage AI embeddings over REST. `voyage-4` returns 1024 dimensions, which
 * is what every `vector(1024)` column in the schema expects — change the
 * model and you re-embed everything (see EMBEDDING_DIMENSIONS in the schema).
 *
 * input_type matters: Voyage prepends a retrieval prompt so that a question
 * ("query") and a knowledge-base passage ("document") land in the same space
 * the way the model was trained for. Always embed KB text as documents and
 * RFP questions as queries.
 */
export const EMBED_MODEL = "voyage-4";
export const EMBED_DIMENSIONS = 1024;

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const BATCH = 64;

/** Read per call, not at import: the dev server reloads .env.local without re-evaluating modules. */
function apiKey(): string | undefined {
  return readSecret("VOYAGE_API_KEY");
}

export function embedConfigError(): string | null {
  return apiKey() ? null : "VOYAGE_API_KEY is not set on the server.";
}

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens: number };
}

async function embedBatch(input: string[], inputType: "query" | "document"): Promise<number[][]> {
  const key = apiKey();
  if (!key) throw new Error(embedConfigError()!);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ input, model: EMBED_MODEL, input_type: inputType, output_dimension: EMBED_DIMENSIONS }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`voyage ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as VoyageResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Knowledge-base passages, approved answers: the things a question is matched against. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) out.push(...(await embedBatch(texts.slice(i, i + BATCH), "document")));
  return out;
}

/** An RFP question, at retrieval time. */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedBatch([text], "query");
  return v;
}

/** The text a KB entry is embedded from: name, product, module and the body together. */
export function kbEntryEmbedText(entry: { product: string; module: string; featureName: string; body: string; tags?: string[] }): string {
  return [`${entry.product} · ${entry.module.replace(/_/g, " ")} · ${entry.featureName}`, entry.body, entry.tags?.length ? `Tags: ${entry.tags.join(", ")}` : ""]
    .filter(Boolean)
    .join("\n");
}

export function approvedAnswerEmbedText(a: { canonicalQuestion: string; canonicalAnswer: string }): string {
  return `${a.canonicalQuestion}\n${a.canonicalAnswer}`;
}

/** What a question is embedded from: the text plus acceptance criteria, which often names the real ask. */
export function questionEmbedText(q: { questionText: string; acceptanceCriteria?: string | null }): string {
  return q.acceptanceCriteria ? `${q.questionText}\nExpected: ${q.acceptanceCriteria}` : q.questionText;
}
