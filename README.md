# Daymark

Daymark is a task manager for organizing work into sections. Create an account, add tasks, track their status, and search across your workspace.

## Features

- Sign up and sign in with JWT authentication.
- Create sections to organize tasks by project or area of work.
- Create tasks with a title, description, and status: **To do**, **In review**, or **Done**.
- View tasks in a section or browse all tasks together.
- Search task titles and descriptions across sections, filter by status, and drag tasks between statuses.
- See live time in each task's current status and the average current time per status column within a section.
- Delete tasks and switch between light and dark themes.

## Run with Docker

### Requirements

- Docker Desktop, or Docker Engine with Docker Compose.

### Start

From the project root, start the application:

```sh
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173).

Compose starts three services:

| Service | Purpose | Local address |
| --- | --- | --- |
| `client` | React app running with Vite | `http://localhost:5173` |
| `server` | Express API | `http://localhost:4000` |
| `mongo` | MongoDB database | Available to the other containers as `mongodb://mongo:27017/` |

Docker uses the same frontend and backend ports as local development. The client forwards `/api` requests to `server:4000`, and the API connects to MongoDB at `mongo:27017`. MongoDB data is saved in a Docker volume and is kept when containers are stopped.

Stop the services with **Ctrl+C** or, from another terminal:

```sh
docker compose down
```

To stop the services and permanently remove their saved MongoDB data:

```sh
docker compose down --volumes
```

The Docker Compose configuration is for local development and uses a development-only JWT secret. Do not expose it to the internet.

## Run locally without Docker

### Requirements

- Node.js 20 or newer and npm.
- MongoDB running at `mongodb://localhost:27017/`.

### Start the API

In a terminal at the project root, install the backend dependencies:

```sh
cd backend
npm install
```

If you have not already created `backend/.env`, copy the example:

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```sh
cp .env.example .env
```

Start the API:

```sh
npm run dev
```

The API is available at [http://localhost:4000](http://localhost:4000). Check that it is running at [http://localhost:4000/api/health](http://localhost:4000/api/health).

### Start the client

In a second terminal at the project root:

```sh
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually [http://localhost:5173](http://localhost:5173). In local development, Vite forwards `/api` requests to the API on port `4000`.

## Configuration

The backend loads local settings from `backend/.env`:

| Variable | Local default | Description |
| --- | --- | --- |
| `PORT` | `4000` | Port used by the Express API. |
| `JWT_SECRET` | Development-only fallback | Secret used to sign authentication tokens. Set a private, strong value for any non-local deployment. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Browser origin allowed by the API. |
| `MONGODB_URI` | `mongodb://localhost:27017/` | MongoDB connection string. |
| `MONGODB_DB_NAME` | `daymark` | MongoDB database name. |

When running with Docker Compose, no `.env` file is required. The Compose file supplies local API settings and the server connects to the `mongo` service rather than `localhost`. For non-Docker local development, create `backend/.env` from `backend/.env.example` as described above.

Tasks record the time they enter each status and cumulative seconds spent there. The column's average SLA uses the current time in status for tasks currently in that column, so it resets with the task timer after a status change. Existing tasks are initialized using their last update time, or their creation time if they have not been updated, so historical time from before this tracking was added cannot be recovered.

## Project structure

```text
.
├── backend/              # Express API, JWT authentication, and MongoDB access
├── frontend/             # React, Vite, and Tailwind CSS app
├── docker-compose.yml    # Local client, server, and MongoDB services
└── README.md             # Setup and usage guide
```

## Security

- `backend/.env` contains local configuration and should not be committed or shared.
- The example and Docker Compose JWT secrets are for development only.
- The Compose MongoDB service is for local use and does not configure database credentials.
- Before exposing the application publicly, configure strong secrets, HTTPS, and a secured MongoDB deployment.
