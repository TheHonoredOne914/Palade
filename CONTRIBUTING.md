# Contributing to Palade

Thank you for your interest in contributing! This document provides guidelines for contributing to Palade.

## Architecture and Scope
Palade is a codebase intelligence engine designed as a **read-only observability tool**.

**CRITICAL:** Palade NEVER modifies a user's source code automatically.
Pull requests that attempt to introduce autonomous code editing or refactoring capabilities will be rejected immediately. We maintain a strict zero-modification policy to ensure enterprise safety.

## Setting Up For Development

1. Fork and clone the repository.
2. Install dependencies using `npm install`.
3. Set up your environment variables (`cp .env.example .env`).
4. Build the project using `npm run build`.

## Testing

All new features and bug fixes MUST include corresponding unit tests.
Run the test suite via:

```bash
npm run test
```

Ensure all tests pass before submitting a Pull Request.

## Pull Request Process

1. Create a descriptive branch name (e.g. `feat/ollama-provider` or `fix/router-timeout`).
2. Implement your changes along with tests.
3. Update `CHANGELOG.md` if necessary.
4. Open a Pull Request against the `main` branch.
5. Provide a clear one-line "why" for any major architectural changes in your PR description.
