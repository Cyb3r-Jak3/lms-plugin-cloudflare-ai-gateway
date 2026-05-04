import {
  type Chat,
  type GeneratorController,
  type InferParsedConfig,
} from "@lmstudio/sdk";
import { configSchematics, globalConfigSchematics } from "./config";
import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import {
  jsonSchema,
  streamText,
  StreamTextResult,
  tool,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import type { AiGateway } from "ai-gateway-provider";
/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type ToolCallState = {
  id: string;
  name: string;
  arguments: string;
  nameReported: boolean;
};

/* -------------------------------------------------------------------------- */
/*                               Build helpers                                */
/* -------------------------------------------------------------------------- */

/** Build a pre-configured OpenAI client. */
function createGateway(
  globalConfig: InferParsedConfig<typeof globalConfigSchematics>,
): AiGateway {
  return createAiGateway({
    accountId: globalConfig.get("cloudflareAccountID"),
    gateway: globalConfig.get("cloudflareAIGatewayName"),
    apiKey: globalConfig.get("cloudflareAPIToken"),
  });
}

/** Convert internal chat history to the format expected by OpenAI. */
function toOpenAIMessages(history: Chat): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const toolCallNames = new Map<string, string>();

  for (const message of history) {
    switch (message.getRole()) {
      case "system":
        messages.push({ role: "system", content: message.getText() });
        break;

      case "user":
        messages.push({ role: "user", content: message.getText() });
        break;

      case "assistant": {
        const toolCalls = message.getToolCallRequests().map((toolCall) => ({
          type: "tool-call" as const,
          toolCallId: toolCall.id ?? "",
          toolName: toolCall.name,
          input: toolCall.arguments ?? {},
        }));

        for (const toolCall of toolCalls) {
          toolCallNames.set(toolCall.toolCallId, toolCall.toolName);
        }

        messages.push({
          role: "assistant",
          content: toolCalls.length
            ? [
                ...(message.getText()
                  ? [{ type: "text" as const, text: message.getText() }]
                  : []),
                ...toolCalls,
              ]
            : message.getText(),
        });
        break;
      }

      case "tool": {
        const toolResults = message
          .getToolCallResults()
          .map((toolCallResult) => ({
            type: "tool-result" as const,
            toolCallId: toolCallResult.toolCallId ?? "",
            toolName:
              toolCallNames.get(toolCallResult.toolCallId ?? "") ?? "tool",
            output: {
              type: "json" as const,
              value: toolCallResult.content,
            },
          }));

        if (toolResults.length) {
          messages.push({
            role: "tool",
            content: toolResults,
          });
        }
        break;
      }
    }
  }

  return messages;
}

/** Convert LM Studio tool definitions to OpenAI function-tool descriptors. */
function toAITools(ctl: GeneratorController): ToolSet | undefined {
  const entries = ctl.getToolDefinitions().map(
    (t) =>
      [
        t.function.name,
        tool({
          description: t.function.description,
          inputSchema: jsonSchema(
            t.function.parameters ?? { type: "object", properties: {} },
          ),
        }),
      ] as const,
  );

  return entries.length ? Object.fromEntries(entries) : undefined;
}

/* -------------------------------------------------------------------------- */
/*                            Stream-handling utils                           */
/* -------------------------------------------------------------------------- */

async function consumeStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  ctl: GeneratorController,
) {
  const toolCalls = new Map<string, ToolCallState>();

  function reportToolName(state: ToolCallState) {
    if (state.nameReported) {
      return;
    }

    ctl.toolCallGenerationNameReceived(state.name);
    state.nameReported = true;
  }

  function flushToolCall(toolCallId: string, parsedArguments?: unknown) {
    const current = toolCalls.get(toolCallId);
    if (current === undefined) {
      return;
    }

    const argumentsObject =
      parsedArguments ??
      (current.arguments.length ? JSON.parse(current.arguments) : {});

    ctl.toolCallGenerationEnded({
      type: "function",
      name: current.name,
      arguments: argumentsObject as Record<string, any>,
      id: current.id,
    });
    toolCalls.delete(toolCallId);
  }

  for await (const part of stream) {
    switch (part.type) {
      case "text-delta": {
        ctl.fragmentGenerated(part.text);
        break;
      }

      case "tool-input-start": {
        const state: ToolCallState = {
          id: part.id,
          name: part.toolName,
          arguments: "",
          nameReported: false,
        };
        toolCalls.set(part.id, state);
        ctl.toolCallGenerationStarted({ toolCallId: part.id });
        reportToolName(state);
        break;
      }

      case "tool-input-delta": {
        const current = toolCalls.get(part.id);
        if (!current) {
          break;
        }

        current.arguments += part.delta;
        ctl.toolCallGenerationArgumentFragmentGenerated(part.delta);
        break;
      }

      case "tool-call": {
        const existing = toolCalls.get(part.toolCallId);
        const current = existing ?? {
          id: part.toolCallId,
          name: part.toolName,
          arguments: "",
          nameReported: false,
        };

        if (!existing) {
          toolCalls.set(part.toolCallId, current);
          ctl.toolCallGenerationStarted({ toolCallId: part.toolCallId });
        }

        current.name = part.toolName;
        reportToolName(current);

        if (!current.arguments.length) {
          current.arguments = JSON.stringify(part.input ?? {});
        }

        flushToolCall(part.toolCallId, part.input);
        break;
      }

      case "tool-error": {
        ctl.toolCallGenerationFailed(
          part.error instanceof Error
            ? part.error
            : new Error(String(part.error)),
        );
        toolCalls.delete(part.toolCallId);
        break;
      }
    }
  }

  console.info("Generation completed.");
}

/* -------------------------------------------------------------------------- */
/*                                     API                                    */
/* -------------------------------------------------------------------------- */

export async function generate(ctl: GeneratorController, history: Chat) {
  const config = ctl.getPluginConfig(configSchematics);
  const unified = createUnified();

  // Choose the appropriate config fields based on the model
  const globalConfig = ctl.getGlobalPluginConfig(globalConfigSchematics);

  /* 1. Setup client & payload */
  const gateway = createGateway(globalConfig);
  const messages = toOpenAIMessages(history);
  const tools = toAITools(ctl);
  const model = config.get("use_advanced_model")
    ? config.get("advanced_model")
    : `workers-ai/${config.get("model")}`;

  /* 2. Kick off streaming completion */
  let stream;
  try {
    stream = streamText({
      model: gateway(unified(model)),
      tools,
      activeTools: tools ? Object.keys(tools) : undefined,
      messages,
      allowSystemInMessages: globalConfig.get("allowSystemInMessages"),
      maxRetries: globalConfig.get("maxRetries"),
      abortSignal: ctl.abortSignal,
    });
  } catch (error) {
    console.error("Error initiating generation:", error);
    throw error;
  }

  try {
    await consumeStream(stream.fullStream, ctl);
  } catch (error) {
    console.error("Error during stream consumption:", error);
    throw error;
  }
}
