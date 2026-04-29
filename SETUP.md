# Setup Guide

## Docker
```bash
docker compose up --build
```

URLs:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs

## Manual backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Manual frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## PostgreSQL
Create DB/user:
- database: `opfdb`
- user: `opfuser`
- password: `opfpassword`

## Run order
1. Start PostgreSQL
2. Start backend
3. Start frontend
4. Register
5. Login
6. Upload JSON
7. Validate
8. Run OPF
