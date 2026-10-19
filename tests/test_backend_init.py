import sys
from pathlib import Path

# Add backend to sys.path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

def test_fastapi_app():
    from app.main import app
    from app.core.config import settings

    assert app.title == "CogniDesk API"
    assert settings.VERSION == "1.0.0"
    print("Backend initialization test passed successfully!")

if __name__ == "__main__":
    test_fastapi_app()
