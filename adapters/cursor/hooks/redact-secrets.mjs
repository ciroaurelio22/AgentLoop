#!/usr/bin/env node
import { emitEmpty, emitJson, readHookInput } from './lib/hook-io.mjs';

const input = readHookInput();
const path = input.file_path ?? input.path ?? '';

if (!path) {
  emitEmpty();
}

if (/\.env\.example$/i.test(path) || /\/\.env\.example$/i.test(path)) {
  emitEmpty();
}

if (/\.env(\.|$)/i.test(path) || /\/\.env(\.|$)/i.test(path)) {
  const msg = 'Lettura file env bloccata. Usa variabili documentate in .env.example.';
  emitJson({ permission: 'deny', user_message: msg, agent_message: msg }, 2);
}

if (
  /\.(pem|key|p12|pfx)$/i.test(path) ||
  /id_rsa/i.test(path) ||
  /id_ed25519/i.test(path)
) {
  const msg = 'Lettura file con credenziali/chiavi bloccata.';
  emitJson({ permission: 'deny', user_message: msg, agent_message: msg }, 2);
}

emitEmpty();
