# Local development

Installed: Node.js 22 (includes npm), PostgreSQL 16, and pgAdmin 4.
Dependencies installed from both package-lock.json files; both builds passed.
Both .env files were copied from their examples. Database initialized with 12 tables and 8 products.

## Start development
Open disc-market.code-workspace in VS Code and create two NEW terminals.
If npm is blocked by PowerShell execution policy, use npm.cmd instead of npm.

Frontend terminal:
```powershell
cd disc-market-frontend
npm.cmd run dev
```
Open http://localhost:5173

Backend terminal:
```powershell
cd disc-market-backend
npm.cmd run dev
```
Health check: http://localhost:5000/api/health

PostgreSQL runs as the Windows service postgresql-x64-16. Docker is optional and was not installed.

## View the database
Open pgAdmin 4 from the Windows Start menu.
Right-click Servers > Register > Server.
General > Name: Disc Market local
Connection:
- Host: localhost
- Port: 5432
- Maintenance database: disc_market_db
- Username: postgres
- Password: postgres (local development settings from .env.example)

Navigate Servers > Disc Market local > Databases > disc_market_db > Schemas > public > Tables.
Right-click a table > View/Edit Data > All Rows.
You can inspect products, categories, inventory, users, orders, and the other tables.

## Rebuild / reload sample catalog
Run npm.cmd run build in either repository.
The backend README uses npm.cmd run seed to load the catalog.
The initial setup ran the same seed from its compiled JavaScript with node dist/seed/seed.js.

Each repository remains on branch yazmin. No application source or dependency versions were changed.
