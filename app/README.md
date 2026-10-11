# Agent Activity Explorer (Part A)

Run the mock API first, from the repo root:

```
npm install
npm run api        # http://localhost:4000
```

Then the app:

```
cd app
npm install
npm run dev        # http://localhost:5173
```

Checks:

```
npm test           # unit and page tests (Vitest)
npm run typecheck
npm run lint
npm run build      # production build in dist/
```

See `NOTES.md` in the repo root for decisions, trade-offs and how AI was used.
