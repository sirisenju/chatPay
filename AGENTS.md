# Workspace Agent Guidelines — ChatPay

## 1. Git Version Control: User-Only Manual Add, Commit, and Push
- **NEVER run `git add`, `git commit`, `git push`, or any command that stages, commits, or pushes changes**.
- **The USER must always be the one to manually add, commit, and push changes** so that they review all work before it is committed or published.
- Agents may run read-only git inspection commands (`git status`, `git diff`, `git log`) to verify working directory status, but MUST NEVER stage, commit, or push under any circumstances.

## 2. Zero-Tolerance Rule: Do NOT Touch or Access `.env` Files
- Never touch, open, read, inspect, display, edit, or modify any `.env` file (`.env`, `.env.local`, `.env.production`, etc.).
- Never log, print, output, or echo environment file contents.
- Allowed Exception: `.env.example` templates with dummy/placeholder values.

## 3. Scope & Continuity
- Backend operations are restricted to `chatpay-backend/`.
- Maintain `chatpay-backend/RESUME.md` for task continuity.
