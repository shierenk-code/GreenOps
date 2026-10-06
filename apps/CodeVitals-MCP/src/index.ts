import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { ALL_TOOLS_DEFS } from './tools/tool-registry.js';
import { handleCodeHealth } from './tools/code_health.js';
import { handleCodeHealthDiff } from './tools/code_health_diff.js';
import { handleCodeSecurity } from './tools/code_security.js';
import { handleCodeDependencies } from './tools/code_dependencies.js';
import { handleCodeDeprecations } from './tools/code_deprecations.js';
import { handleCodeBugs } from './tools/code_bugs.js';
import { handleCodeArchitecture } from './tools/code_architecture.js';
import { handleCodeFixPlan } from './tools/code_fix_plan.js';
import { logger } from './utils/logger.js';

async function main() {
  const server = new Server(
    {
      name: 'greenops-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ALL_TOOLS_DEFS,
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Tool invocation: ${name}`, { args });

    try {
      switch (name) {
        case 'code_health': {
          const res = await handleCodeHealth((args as any) || {});
          return {
            content: [{ type: 'text', text: res.formattedOutput }],
          };
        }
        case 'code_health_diff': {
          const res = await handleCodeHealthDiff((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        case 'code_security': {
          const res = await handleCodeSecurity((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        case 'code_dependencies': {
          const res = await handleCodeDependencies((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        case 'code_deprecations': {
          const res = await handleCodeDeprecations((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        case 'code_bugs': {
          const res = await handleCodeBugs((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        case 'code_architecture': {
          const res = await handleCodeArchitecture((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        case 'code_fix_plan': {
          const res = await handleCodeFixPlan((args as any) || {});
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          };
        }
        default:
          throw new Error(`Unknown tool requested: ${name}`);
      }
    } catch (err: any) {
      logger.error(`Error in tool ${name}`, { error: err.message });
      return {
        isError: true,
        content: [{ type: 'text', text: `GreenOps Tool Error [${name}]: ${err.message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('GreenOps MCP Server listening on stdio.');
}

main().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
