# Cloudflare AI Gateway for LM Studio

LM Studio plugin to connect to the Cloudflare AI Gateway, allowing you to use any model available in the gateway directly from LM Studio.

Supports both models hosted with Cloudflare's Workers AI product as well as any model in the Cloudflare AI Gateway catalog, which includes models hosted by Cloudflare and third-party providers. Some models may require additional configuration in the Cloudflare dashboard, such as setting up billing.

Getting Started:

1. Create a new gateway in the Cloudflare dashboard and obtain the API key and any necessary model information. [Cloudflare Docs](https://developers.cloudflare.com/ai-gateway/get-started/)

2. Install this plugin in LM Studio and enter your Cloudflare API key, account ID, AI Gateway name
3. Select the desired model from the configuration options.
4. Start using the gateway in your conversations!

If you want to use a model that is not in the default "Workers AI" catalog, enable "Use Advanced Model Selection" and select the model from the "Model Catalog" option. This will allow you to access a wider range of models available in the Cloudflare AI Gateway catalog, not all have been tested with this plugin but should work as long as they are compatible with the API.
