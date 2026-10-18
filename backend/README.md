# Backend (FastAPI)

This directory contains the server-side logic for the project.

### Planned Structure:
- `app/`
  - `main.py`: Entrypoint for FastAPI server.
  - `core/`: App configuration (database URL, environment variables).
  - `models/`: Database schema definitions (SQLAlchemy / SQL models).
  - `api/`: REST API route controllers (endpoints for devices, metrics, alerts).
  - `services/`: Core logic (data collection loop, SNMP polling, ML integration).
- `requirements.txt`: Python package dependencies.
