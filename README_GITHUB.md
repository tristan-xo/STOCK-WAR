# Stock Wars

A six-round portfolio-management simulation for college events.

## Architecture

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: SQLite
- Authentication: Express sessions + bcrypt
- Live synchronization: Server-Sent Events (SSE)
- Market simulation: autonomous news and price engine

## Deployment

This is **not a GitHub Pages application** because it requires a live Node.js server. Use GitHub to store the repository and Render (configured by `render.yaml`) to run the application.

See `GITHUB_DEPLOYMENT.md` for the complete deployment procedure.
