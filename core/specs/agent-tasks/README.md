# Agent tasks (`program.md`)

Ogni task autonomo ha un file **`specs/agent-tasks/<TASK-ID>.md`** — equivalente al `program.md` di Karpathy: obiettivo, vincoli, acceptance verificabili.

La coda `.cursor/agent-loop/queue.json` contiene solo **riferimenti** (id, priority, status, path al program).

## Creare un task (flusso consigliato)

### 1. Copia il template

```bash
cp specs/agent-tasks/_template.md specs/agent-tasks/TASK-042.md
```

Oppure:

```bash
pnpm agent:init TASK-042 "Titolo breve" --priority 10
```

### 2. Compila il program

Apri `specs/agent-tasks/TASK-042.md` e compila:

- **Obiettivo** — una frase
- **Vincoli** — cosa non toccare
- **Scope** — FR, package, spec di riferimento
- **Acceptance criteria** — checklist `- [ ]` → l'agent le spunta in `- [x]`
- **Verifica** — comandi opzionali extra

> Un program sottospecificato fa girare il loop verso l'obiettivo sbagliato (Karpathy). Investi qui, non nei prompt.

### 3. Registra in coda

Se hai usato `agent:init`, il task è già in coda. Altrimenti:

```bash
pnpm agent:register TASK-042
```

### 4. Avvia l'agent

```bash
pnpm agent:next          # vedi il prompt
pnpm agent:status        # stato coda
```

Poi avvia **Cloud Agent** o **Background Agent** sul repo (o crea `.cursor/agent-loop/autostart` per IDE locale).

**Windows — GUI locale:** doppio click su `tools/agent-gui/run-gui.bat` oppure `pnpm agent:gui`. Vedi `tools/agent-gui/README.md`.

### 5. Review umana

L'agent apre/aggiorna la PR. Tu fai merge — mai autonomo.

## Chiusura task

Il loop accetta `DONE` nello scratchpad **solo se**:

1. Tutte le voci in **Acceptance criteria** del program sono `- [x]`
2. Lint + typecheck + **test** sui package toccati passano (hook `stop`)
3. Riga `DONE` in `.cursor/agent-loop/scratchpad.md`

## Issue GitHub

Apri issue con template **Agent** (`agent-ready`) per bootstrap comment; per task ricorrenti preferisci program.md + coda.
