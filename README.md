# BURNED site

The public, Vercel-ready landing page for BURNED / EMBER.

## Deploy

[Import this repository into Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjaycarson373-tech%2FBURNED-site)

Sign into Vercel, choose the GitHub account `jaycarson373-tech`, and click Deploy. Keep the repository root as the Root Directory. The committed `vercel.json` supplies all settings:

- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variables: none

This repository intentionally contains only the public website. The reward worker, database setup, and signing integration remain in the private BURNED repository.

## Local preview

```sh
npm install
npm run dev
```
