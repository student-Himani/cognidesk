"""
CogniDesk FastAPI Entry Point (Backend Directory)
Enables running:
  uvicorn main:app --host 0.0.0.0 --port 8000
  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
import os
import sys

# Ensure the backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
