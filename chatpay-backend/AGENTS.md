# Agent Operating Guidelines — Chatpay Backend

Welcome to the **Chatpay Backend** repository. All AI assistants, agents, subagents, and automated workflows operating in this codebase must strictly adhere to the instructions and constraints defined in this document.

---

## 1. Critical Security Rules & Guardrails

### 🚨 Zero-Tolerance Rule: Do NOT Touch or Access `.env` Files
- **Never touch, open, read, inspect, display, edit, or modify any `.env` file** (including `.env`, `.env.local`, `.env.production`, `.env.test`, `.env.stage`, etc.).
- **Never log, print, output, or echo environment file contents** in terminal commands, tool outputs, artifacts, or chat responses.
- **Never attempt to search or grep inside `.env` files**.
- **Allowed Exception**: Agents may create, inspect, and update `.env.example` solely as an example/template schema file using dummy/placeholder values. Never put real credentials or secrets in `.env.example`.

### 🚨 Workspace Boundaries
- **Strictly restricted to `chatpay-backend/`**:
  - Do NOT create, read, modify, or execute files outside the `chatpay-backend` folder.
  - All command execution (`Cwd`) and path references must strictly remain within this repository root.

---

## 2. Context Continuity & Session Resumption

- **`RESUME.md`**:
  - `RESUME.md` exists in the repository root to maintain task state, ongoing architectural decisions, and handoff notes across agent sessions.
  - `RESUME.md` is tracked in `.gitignore` to prevent leaking session scratchpad data to remote version control.
  - Update `RESUME.md` after completing significant milestones or before handing off work to a future agent session.

---

## 3. General Development Guidelines

- **Architecture & Code Quality**:
  - Write clean, maintainable, modular, and well-typed code.
  - Maintain comprehensive error handling and avoid unhandled promise rejections or silent failures.
  - Avoid hardcoding secrets, credentials, or private URLs in application code.
- **Testing & Verification**:
  - Write unit and integration tests where applicable.
  - Run verification and test suites locally before marking tasks as complete.
- **Git Hygiene**:
  - Respect `.gitignore` rules at all times.
  - Never commit build artifacts, node modules, logs, or secret keys.
