import { createConfigSchematics } from "@lmstudio/sdk";

const models = require("../models.json") as Record<"cf" | "catalog" | "full_catalog", Record<string, string>>;

type ModelCatalog = keyof typeof models;

function buildModelOptions(catalog: ModelCatalog) {
  return Object.entries(models[catalog])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([displayName, modelPath]) => ({
      displayName,
      value: modelPath,
    }));
}

const cfModelOptions = buildModelOptions("cf");
const fullCatalogModelOptions = buildModelOptions("full_catalog");


export const configSchematics = createConfigSchematics()
  .field(
    "model",
    "select",
    {
      displayName: "Model",
      subtitle: "Cloudflare Worker's AI Gateway model to use. Can also select from the full model option to override with any model in the catalog.",
      options: cfModelOptions,
    },
    cfModelOptions[0].value
  )
  .field(
    "advanced_model",
    "select",
    {
        displayName: "Advanced Model Selection",
        subtitle: "Greater selection of models from the Cloudflare AI Gateway catalog. Only used if 'Use Advanced Model Selection' is enabled. Some models may require additional configuration in Cloudflare AI Gateway to work properly, such as setting up billing",
        options: fullCatalogModelOptions,
    },
    fullCatalogModelOptions[0].value
  )
  .field(
    "use_advanced_model",
    "boolean",
    {
        displayName: "Use Advanced Model Selection",
        subtitle: "If enabled, the 'Model Catalog' selection will be ignored and the model specified in 'Advanced Model Selection' will be used instead. This allows access to a wider range of models available in the Cloudflare AI Gateway catalog.",
    },
    false,
  )
    .build();

export const globalConfigSchematics = createConfigSchematics()
  .field(
    "cloudflareAPIToken",
    "string",
    {
      displayName: "Cloudflare API Token",
      isProtected: true,
      placeholder: "cf-...",
    },
    "",
  )
  .field(
    "cloudflareAccountID",
    "string",
    {
      displayName: "Cloudflare Account ID",
      subtitle: "Used with AI Gateway",
      placeholder: "e.g. 1234567890abcdef",
    },
    "",
  )
  .field(
    "cloudflareAIGatewayName",
    "string",
    {
      displayName: "Cloudflare AI Gateway Name",
      subtitle: "Used with AI Gateway",
      placeholder: "e.g. my-ai-gateway",
    },
    "",
  )
  .field(
    "maxRetries",
    "numeric",
    {
        displayName: "Max Retries",
        subtitle: "Number of times to retry a request to the Cloudflare AI Gateway in case of failure. Default is 3.",
        min: 0,
        int: true,
    },
    3,
  )
  .field(
    "allowSystemInMessages",
    "boolean",
    {
        displayName: "Allow System Messages in Chat History",
        subtitle: "If enabled, system messages from the chat history will be included in the messages sent to the model. System messages are typically used for instructions or context that should be provided to the model but not shown to the user.",
    },
    true,
  )
  .build();