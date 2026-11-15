#!/usr/bin/env bash
# Farmer's Eye — All-in-One Development & Demo Launcher
# NASA Space Apps Challenge 2026

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================================="
echo "🌾  Launching Farmer's Eye — Mission Control System"
echo "    NASA Space Apps Challenge 2026"
echo "=========================================================="

cleanup() {
    echo ""
    echo "🛑 Shutting down Farmer's Eye background processes..."
    kill $(jobs -p) 2>/dev/null || true
    echo "👋 Shutdown complete. Goodbye!"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start FastAPI Backend
echo "🚀 [1/2] Starting FastAPI Backend on http://127.0.0.1:8000..."
cd "$PROJECT_ROOT/backend"
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# Wait briefly for backend to initialize
sleep 2

# 2. Start React + Vite Frontend
echo "🛰️  [2/2] Starting React 19 Frontend on http://localhost:5173..."
cd "$PROJECT_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo "✅ Farmer's Eye is LIVE and READY!"
echo "   • Frontend Mission Control: http://localhost:5173"
echo "   • Backend API Swagger Docs: http://127.0.0.1:8000/docs"
echo "   • Press Ctrl+C in this terminal to stop both servers."
echo "=========================================================="

wait
