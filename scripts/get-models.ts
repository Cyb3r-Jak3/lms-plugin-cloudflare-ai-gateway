import { writeFile } from "fs/promises";
import { resolve } from "path";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ModelTask {
  id: string;
  name: string;
  description: string;
}

interface ModelProperty {
  property_id: string;
  value: unknown;
}

interface CloudflareModel {
  id: string;
  source: number;
  name: string;
  task: ModelTask;
  tags: string[];
  properties: ModelProperty[];
}

interface CloudflareModelCatalogEntry {
  model_id: string;
  provider_id: string;
  name: string;
  task: string;
  tags: string[];
}

interface CloudflareAIGatewayModelCatalogEntry {
  id: string;
  object: string;
  owned_by: string;
}

type ModelMap = Record<string, string>;

function hasDeprecationDate(model: CloudflareModel): boolean {
  return model.properties.some(
    (p) => p.property_id === "planned_deprecation_date",
  );
}

async function workersAIModels(): Promise<Record<string, string>> {
  const response = await fetch(
    "https://api.cyberjake.xyz/cloudflare_api/ai_models",
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`,
    );
  }

  const models = (await response.json()) as CloudflareModel[];

  const textGenerationModels = models.filter(
    (m) => m.task.name === "Text Generation" && !hasDeprecationDate(m),
  );

  const modelMap: ModelMap = Object.fromEntries(
    textGenerationModels.map((m) => [m.name.split("/").pop()!, m.name]),
  );
  return modelMap;
}

async function workersAICatalog(): Promise<Record<string, string>> {
  const response = await fetch(
    "https://api.cyberjake.xyz/cloudflare_api/ai_models_catalog",
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models catalog: ${response.status} ${response.statusText}`,
    );
  }

  const models = (await response.json()) as CloudflareModelCatalogEntry[];

  const textGenerationModels = models.filter(
    (m) => m.task === "Text Generation",
  );

  const modelMap: ModelMap = Object.fromEntries(
    textGenerationModels.map((m) => [
      `${m.name.split("/").pop()!} (${m.provider_id})`,
      m.name,
    ]),
  );
  return modelMap;
}

async function workersAIFullCatalog(): Promise<Record<string, string>> {
  const response = await fetch(
    "https://api.cyberjake.xyz/cloudflare_api/ai_gateway_models_catalog",
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models catalog: ${response.status} ${response.statusText}`,
    );
  }

  const models =
    (await response.json()) as CloudflareAIGatewayModelCatalogEntry[];
  const requestableModels = [
    "anthropic",
    "openai",
    "google-ai-studio",
    "grok",
    "groq",
    "deepseek",
    "mistral",
    "cerebras",
    "baseten",
    "cohere",
    "perplexity-ai",
    "workers-ai",
  ];
  const textGenerationModels = models.filter((m) =>
    requestableModels.includes(m.owned_by),
  );
  textGenerationModels.sort(
    (a, b) => a.owned_by.localeCompare(b.owned_by) || a.id.localeCompare(b.id),
  );

  const modelMap: ModelMap = Object.fromEntries(
    textGenerationModels.map((m) => [
      `${m.id.split("/").pop()!} (${m.owned_by})`,
      m.id,
    ]),
  );
  return modelMap;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const modelMap = await workersAIModels();
  const catalogModelMap = await workersAICatalog();
  const fullCatalogModelMap = await workersAIFullCatalog();

  const outputMap: Record<string, ModelMap> = {
    cf: modelMap,
    catalog: catalogModelMap,
    full_catalog: fullCatalogModelMap,
  };
  const totalModels =
    Object.keys(modelMap).length +
    Object.keys(catalogModelMap).length +
    Object.keys(fullCatalogModelMap).length;

  const outputPath = resolve(__dirname, "../models.json");
  await writeFile(outputPath, JSON.stringify(outputMap, null, 2), "utf-8");

  console.log(`Wrote ${totalModels} models to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
