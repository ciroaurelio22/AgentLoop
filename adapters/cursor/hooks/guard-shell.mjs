#!/usr/bin/env node
import { emitEmpty, emitJson, readHookInput } from './lib/hook-io.mjs';

const input = readHookInput();
const command = input.command ?? input.tool_input?.command ?? '';

if (!command) {
  emitEmpty();
}

const blockedPatterns = [
  /rm\s+-rf\s+\//i,
  /git\s+push\s+.*--force($|\s)/i,
  /git\s+push\s+-f\s/i,
  /git\s+push\s+.*\s+-f\s*$/i,
  /curl\s+(-[^\s]+\s+)*https?:\/\/[^\s]*app\.vigila81\.it/i,
  /\bnpm\s+(install|ci|run)\b/i,
  /\byarn\s+(install|add)\b/i,
  /\bpnpm\s+add\s+(-g|--global)(\s|$)/i,
];

const denyMessage =
  'Comando bloccato dalla policy agent-loop. Usa il package manager del repo e non forzare push o comandi distruttivi.';

for (const pattern of blockedPatterns) {
  if (pattern.test(command)) {
    if (input.tool_name != null) {
      emitJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denyMessage,
        },
      });
    }
    emitJson(
      {
        permission: 'deny',
        user_message: denyMessage,
        agent_message: denyMessage,
      },
      2,
    );
  }
}

emitEmpty();
