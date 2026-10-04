# Stock Wars — GitHub + Render Deployment

## Important: GitHub Pages is not enough

Stock Wars is a Node.js + Express application with SQLite, sessions, trading APIs and Server-Sent Events. GitHub Pages can host only static files; it cannot run `server.js`.

Use GitHub as the source-code repository and Render (or another Node.js host) as the application server.

## 1. Create the GitHub repository

Create a new GitHub repository, for example:

`stock-wars`

Upload the contents of this folder to the repository root. Do not upload `.env` or `node_modules`.

Required application files include:

- `server.js`
- `package.json`
- `package-lock.json`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `STOCK_LIST.csv`
- `.env.example`
- `render.yaml`
- `.gitignore`

The database file is intentionally ignored. The server creates the database and seeds the event data on first start.

## 2. Deploy from GitHub to Render

1. Create a Render account.
2. Choose **New → Blueprint**.
3. Connect the GitHub repository.
4. Select the repository containing `render.yaml`.
5. Render will read the deployment configuration.
6. Enter values for `ADMIN_USERNAME` and `ADMIN_PASSWORD` when prompted.
7. Deploy.

The included `render.yaml` configures:

- Node.js production runtime
- `npm ci` build
- `npm start` server command
- HTTPS-ready Express session cookies
- `/healthz` health check
- Persistent SQLite storage at `/var/data/stockwars.db`
- Autonomous news enabled
- 2-minute news phase
- 3-minute trading phase

## 3. Open the website

Render provides a URL similar to:

`https://stock-wars-xxxx.onrender.com`

Players and the host use the same URL. The application itself separates Player Login, Player Registration and Host/Admin Login.

## 4. Change the admin password

Set these Render environment variables:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

Never commit real credentials to GitHub.

## 5. Database persistence

The Render configuration uses a persistent disk mounted at `/var/data`. This is important because the SQLite database contains player accounts, trades, rounds, price history and event state.

If you deploy somewhere without persistent storage, the database can be lost when the service is rebuilt/restarted. For a real event, use persistent storage or migrate the database to PostgreSQL.

## 6. Local testing before deployment

```bash
npm ci
cp .env.example .env
npm start
```

Then open `http://localhost:3000`.

## 7. Git commands

From the project folder:

```bash
git init
git add .
git commit -m "Prepare Stock Wars for deployment"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

After the repository is connected to Render, future pushes to `main` can trigger deployments automatically.
