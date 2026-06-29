# FileOnChain

Upload files permanently on the Autonomys Network.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and managed with **pnpm**.

## Getting Started

Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## Requirements

- Node.js **>= 20** (see `engines` in `package.json`)
- pnpm **>= 10** (see `packageManager` in `package.json`)

Enable [Corepack](https://nodejs.org/api/corepack.html) if you don't have pnpm installed yet — it'll pick up the version pinned in `package.json`:

```bash
corepack enable
corepack prepare pnpm@10.28.1 --activate
```

## Scripts

| Command       | What it does                           |
| ------------- | -------------------------------------- |
| `pnpm dev`    | Run the development server             |
| `pnpm build`  | Produce a production build             |
| `pnpm start`  | Serve the production build             |
| `pnpm lint`   | Run ESLint across the project          |

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) — learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) — an interactive Next.js tutorial.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
