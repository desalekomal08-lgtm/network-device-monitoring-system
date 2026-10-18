# Network Device Monitoring and Predictive Fault Analysis System

## 🎓 Academic Project Overview
A hybrid AI-powered network infrastructure monitoring system developed for an engineering degree project. The system monitors network nodes (routers, switches, servers), validates and logs time-series performance metrics to a relational PostgreSQL database, detects operational anomalies using unsupervised machine learning (**Scikit-learn Isolation Forest**), computes an interpretable **Fault-Risk Score (0–100)**, and visualizes real-time status and logical network topology on a React dashboard.

---

## 🏗️ Architecture & Component Overview

```
                      +---------------------------------------+
                      |         Telemetry Data Source         |
                      |   - Modular CLI Telemetry Simulator   |
                      |   - External REST Ingestion Feeds     |
                      +-------------------+-------------------+
                                          |
                                          | HTTP POST Telemetry (CPU, Memory, Bandwidth, Latency, Loss, Errors)
                                          v
                      +---------------------------------------+
                      |            FastAPI Backend            |
                      |  - RESTful Ingestion & Query Endpoints|
                      |  - Pydantic Validation & Aliasing     |
                      |  - CORS & Health Diagnostics          |
                      +-----------+-------------------+-------+
                                  |                   |
               Store / Query Data |                   | Extract Features & Run Inference
                                  v                   v
           +-----------------------------+     +-------------------------------+
           |     PostgreSQL Database     |     |     Machine Learning Engine   |
           |  - Device Registry Table    |     |  - Time-Series Preprocessing  |
           |  - Timestamped Metrics Table|     |  - Rate-of-Change & Trends    |
           |  - Cascading Foreign Keys   |     |  - Isolation Forest Anomaly   |
           +-----------------------------+     |  - Fault-Risk Index (0-100)   |
                                               +---------------+---------------+
                                                               |
                                                               | Diagnostics, Health & Risk
                                                               v
                                               +-------------------------------+
                                               |     React + Vite Dashboard    |
                                               |  - Fleet Health Overview      |
                                               |  - Device Inventory & Search  |
                                               |  - 3-Tier Logical Network Map |
                                               |  - Dual Time-Series Graphs    |
                                               |  - ML Fault Diagnostics Panel |
                                               +-------------------------------+
```

---

## ⚠️ Telemetry & Monitoring Scope Disclaimer

> [!NOTE]
> **Data Collection Architecture**:
> In the current implementation, all telemetry metrics are ingested into the database via the **RESTful Ingestion API** (`POST /api/devices/{device_id}/metrics`) or generated using the **modular device simulator** (`virtual_network/device_simulator.py`).
>
> Automated physical-device SNMP socket polling (querying OIDs via SNMP UDP/161) and dynamic layer-2/layer-3 discovery protocols (e.g., IEEE 802.1AB LLDP / Cisco CDP) are intentionally outside the current academic project scope. The system provides the ingest pipeline, relational database schema, feature engineering, and ML analysis ready to interface with physical SNMP polling daemons in future extensions (Phase 14).

---

## 📁 Project Directory Layout

```
network_monitoring_system/
├── backend/                  # FastAPI Application & Database Layer
│   ├── app/
│   │   ├── database.py       # SQLAlchemy engine & session lifecycle (loads .env)
│   │   ├── main.py           # FastAPI application, CORS middleware, REST endpoints
│   │   ├── models.py         # SQLAlchemy ORM models (Device, MonitoringData)
│   │   └── schemas.py        # Pydantic schemas for request validation & response serialization
│   ├── tests/                # 28-test automated test suite (pytest)
│   ├── .env.example          # Template for database configuration (no credentials)
│   ├── pytest.ini            # Pytest configuration
│   └── requirements.txt      # Python dependencies
├── ml/                       # Machine Learning & Analytics Engine
│   └── src/
│       ├── preprocessing.py  # Time-series feature extraction, moving averages, rate-of-change
│       └── fault_analysis.py # Isolation Forest anomaly detector & 0-100 fault-risk calculator
├── virtual_network/          # Telemetry Simulator
│   ├── device_simulator.py   # Multi-scenario synthetic metric generator with HTTP submission
│   └── README.md             # Virtual network environment documentation
├── frontend/                 # Interactive React + Vite Dashboard
│   ├── src/
│   │   ├── components/       # AddDeviceModal, StatusBadge, RiskBadge
│   │   ├── context/          # ToastContext (subtle toast notifications)
│   │   ├── pages/            # Overview, Devices, NetworkMap, Monitoring, FaultAnalysis
│   │   ├── api.js            # Frontend REST API client
│   │   ├── App.jsx           # Main layout, sidebar navigation, backend connectivity polling
│   │   └── index.css         # Electric Blue + Midnight Navy design system
│   └── package.json          # Node.js dependencies
└── README.md                 # Project documentation
```

---

## 🛠️ Prerequisites

Ensure the following tools are installed on your workstation:
- **Python**: Version `3.11` to `3.13`
- **Node.js**: Version `18.x` or higher (with `npm`)
- **PostgreSQL**: Version `14` or higher (service running locally or remotely)

---

## 🚀 Setup & Installation Instructions

### Step 1: PostgreSQL Database Setup

1. Open PostgreSQL CLI (`psql`) or pgAdmin with your administrative account:
   ```bash
   psql -U postgres
   ```
2. Create the project database:
   ```sql
   CREATE DATABASE network_monitoring_db;
   ```
3. Verify that the database was created:
   ```sql
   \l
   ```
   *(Exit `psql` using `\q`)*

---

### Step 2: Backend Configuration & Startup

1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd network_monitoring_system/backend
   ```
2. Create and activate a Python virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   - **Linux / macOS**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure the environment variables:
   - Copy the template `.env.example` to `.env`:
     ```powershell
     copy .env.example .env      # Windows
     # or: cp .env.example .env  # Linux/macOS
     ```
   - Open `.env` and configure your PostgreSQL connection string:
     ```ini
     DATABASE_URL=postgresql+psycopg2://<username>:<password>@localhost:5432/network_monitoring_db
     PORT=8000
     HOST=127.0.0.1
     ```
5. Start the FastAPI development server:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   *The server automatically verifies the database connection and creates required tables on startup.*

6. Verify backend connectivity:
   - **Interactive API Documentation (Swagger UI)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   - **Health Check Endpoint**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

### Step 3: Frontend Dashboard Startup

1. Open a second terminal window and navigate to `frontend`:
   ```bash
   cd network_monitoring_system/frontend
   ```
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Access the web interface in your browser:
   - **Dashboard UI**: [http://localhost:5173/](http://localhost:5173/)

---

### Step 4: Generate Telemetry with the Device Simulator

Use the built-in simulator to generate and submit realistic telemetry streams to registered devices:

```powershell
# Run from the project root or backend directory:
.\backend\.venv\Scripts\python.exe virtual_network\device_simulator.py --device-id 1 --scenario normal --count 15 --submit
```

#### Available Operational Scenarios
| Scenario Flag | Simulated Behavior | Expected System Detection |
| :--- | :--- | :--- |
| `--scenario normal` | Steady baseline (CPU 22–38%, latency 8–15ms, 0% loss) | `LOW_RISK` (0–39 risk score), normal pattern |
| `--scenario cpu_spike` | Processor load surges to 85–98% | Elevated risk score, `CRITICAL` CPU violation |
| `--scenario memory_leak` | Memory climbs incrementally from 45% to ~93% | Trend ratio warning, `CRITICAL` memory risk |
| `--scenario high_latency` | Transit delay swells past 100ms with jitter | Latency surge warning, degraded link state |
| `--scenario packet_loss` | Packet loss rises to 5–14% with interface errors | High anomaly flag, `CRITICAL` packet drop alert |

#### Useful Simulator Arguments
- `--device-id <id>`: Target registered device ID (default: `1`).
- `--scenario <name>`: Operational scenario (`normal`, `cpu_spike`, `memory_leak`, `high_latency`, `packet_loss`).
- `--count <n>`: Number of readings to generate (default: `5`).
- `--interval <sec>`: Time interval between readings in seconds (default: `15`).
- `--seed <int>`: Random seed for reproducible metric sequences.
- `--submit`: Submits the readings via HTTP POST to the backend API. Omitting `--submit` performs a dry-run print.

---

### Step 5: Run the Automated Test Suite

The project includes 28 automated tests covering API endpoints, data validation, simulator scenarios, feature extraction, and fault analysis edge cases:

```powershell
cd network_monitoring_system/backend
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

---

## 📡 REST API Reference

The backend provides a standardized RESTful API documented automatically via OpenAPI / Swagger:

| HTTP Method | Endpoint | Description | Key Parameters / Request Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Sanity check endpoint verifying backend and PostgreSQL database connectivity. | None |
| `POST` | `/api/devices` | Registers a new network device. Prevents duplicate IP addresses. | Body: `{ device_name, ip_address, device_type, monitoring_method, status }` |
| `GET` | `/api/devices` | Lists all registered network devices in the system. | None |
| `GET` | `/api/devices/{device_id}` | Retrieves details for a specific registered device by ID. | Path: `device_id` (int) |
| `POST` | `/api/devices/{device_id}/metrics` | Ingests and stores a timestamped telemetry reading for a device. | Path: `device_id`, Body: `{ cpu_utilization, memory_usage, bandwidth, latency, packet_loss, interface_errors, device_status }` |
| `GET` | `/api/devices/{device_id}/metrics` | Retrieves historical telemetry records for a device ordered newest-first. | Path: `device_id`, Query: `limit` (default: 100, max: 1000) |
| `GET` | `/api/devices/{device_id}/metrics/latest` | Retrieves the single most recent telemetry record for a device. | Path: `device_id` (int) |
| `GET` | `/api/devices/{device_id}/analysis` | Executes Isolation Forest ML anomaly detection and computes the 0–100 fault-risk score. | Path: `device_id`, Query: `limit` (default: 100, max: 500) |

---

## 🧠 Machine Learning & Risk Scoring Methodology

1. **Feature Engineering**:
   - Computes multivariate rates-of-change ($\Delta CPU$, $\Delta Memory$, $\Delta Latency$).
   - Calculates rolling trend ratios to capture rapid metric acceleration.
2. **Unsupervised Outlier Isolation (Scikit-learn Isolation Forest)**:
   - Evaluates multivariate telemetry distributions without requiring labeled failure datasets.
   - Generates an anomaly decision score based on the path length required to isolate a reading.
3. **Domain Threshold Integration**:
   - Assesses critical networking thresholds (CPU $\ge 75\%/90\%$, Memory $\ge 75\%/88\%$, Packet Loss $\ge 1\%/5\%$, Latency $\ge 40/100$ms, Interface Errors).
4. **Composite Fault-Risk Score (0–100)**:
   $$\text{Fault Risk Score} = 0.5 \times \text{ML Anomaly Score} + 0.5 \times \text{Domain Stress Score}$$
   - **Low Risk (0–39)**: Nominal baseline operation.
   - **Moderate Risk (40–69)**: Noticeable deviation from baseline or warning-level threshold crossings.
   - **High Risk (70–100)**: Critical threshold violations or multivariate anomaly patterns.
   - *Graceful Fallback*: If $<5$ historical readings are available, the system relies on the domain threshold engine until adequate baseline samples accumulate.

---

## 📊 Development Phases Progress

- [x] **Phase 1**: Project foundation, architecture explanation & directory structure.
- [x] **Phase 2**: Basic FastAPI backend setup, health check endpoint (`/health`).
- [x] **Phase 3**: PostgreSQL database connection and SQLAlchemy models.
- [x] **Phase 4**: Device registration & validation (`POST /api/devices`).
- [x] **Phase 5**: Telemetry collection mechanism & simulator (`virtual_network/device_simulator.py`).
- [x] **Phase 6**: Timestamped metric storage & retrieval (`POST/GET /api/devices/{id}/metrics`).
- [x] **Phase 7**: Preprocessing and time-series feature engineering (`ml/src/preprocessing.py`).
- [x] **Phase 8 & 9**: Unsupervised anomaly detection & predictive fault analysis (`ml/src/fault_analysis.py`).
- [x] **Phase 10**: Composite fault-risk score (0–100) & diagnostics engine (`GET /api/devices/{id}/analysis`).
- [x] **Phase 11**: FastAPI endpoints with CORS middleware for web dashboard.
- [x] **Phase 12 & 13**: React + Vite dashboard connected to backend and PostgreSQL.
- [ ] **Phase 14**: Physical SNMP daemon socket polling & virtual network topologies (GNS3 / EVE-NG).
