import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.core.db import SessionLocal
from app.models.workspace import Workspace
from app.models.note import Note
from app.models.document import Document
from app.services.workspace_service import workspace_service

client = TestClient(app)


def test_workspaces_crud_and_scoping():
    # Clean up any leftover test workspaces from previous aborted runs
    db = SessionLocal()
    try:
        leftovers = db.query(Workspace).filter(
            Workspace.name.in_(["Automated Test Workspace", "Renamed Test Workspace"])
        ).all()
        for w in leftovers:
            db.delete(w)
        db.commit()
    finally:
        db.close()

    # 1. Get all workspaces - Default workspace must exist
    res = client.get("/api/v1/workspaces")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    workspaces = data["data"]
    assert len(workspaces) >= 1
    default_ws = next((w for w in workspaces if w["id"] == 1), None)
    assert default_ws is not None
    assert default_ws["name"] == "Default Workspace"

    # 2. Get active workspace
    res = client.get("/api/v1/workspaces/active")
    assert res.status_code == 200
    active_ws = res.json()["data"]
    assert active_ws is not None

    # 3. Create a new workspace
    create_payload = {
        "name": "Automated Test Workspace",
        "description": "Created during pytest execution",
        "category": "Testing"
    }
    create_res = client.post("/api/v1/workspaces", json=create_payload)
    assert create_res.status_code == 201
    new_ws = create_res.json()["data"]
    new_ws_id = new_ws["id"]
    assert new_ws["name"] == "Automated Test Workspace"
    assert new_ws["category"] == "Testing"
    assert new_ws["is_active"] is False

    # 4. Switch active workspace to new_ws
    activate_res = client.post(f"/api/v1/workspaces/{new_ws_id}/activate")
    assert activate_res.status_code == 200
    assert activate_res.json()["data"]["id"] == new_ws_id
    assert activate_res.json()["data"]["is_active"] is True

    # Verify active workspace endpoint reflects switch
    res = client.get("/api/v1/workspaces/active")
    assert res.status_code == 200
    assert res.json()["data"]["id"] == new_ws_id

    # 5. Rename / Update workspace
    update_res = client.put(f"/api/v1/workspaces/{new_ws_id}", json={
        "name": "Renamed Test Workspace",
        "description": "Updated description",
        "category": "Engineering"
    })
    assert update_res.status_code == 200
    assert update_res.json()["data"]["name"] == "Renamed Test Workspace"
    assert update_res.json()["data"]["category"] == "Engineering"

    # 6. Verify Notes Scoping with X-Workspace-Id
    # Create note in new workspace
    note_payload = {
        "title": "Scoped Note for Test Workspace",
        "content": "This note belongs only to the renamed test workspace.",
        "category": "Automated Test"
    }
    note_res = client.post("/api/v1/notes", json=note_payload, headers={"X-Workspace-Id": str(new_ws_id)})
    assert note_res.status_code == 201
    created_note = note_res.json()["data"]
    note_id = created_note["id"]

    # Fetch notes for new workspace - should contain the note
    notes_new_ws = client.get("/api/v1/notes", headers={"X-Workspace-Id": str(new_ws_id)})
    assert notes_new_ws.status_code == 200
    new_ws_note_ids = [n["id"] for n in notes_new_ws.json()["data"]]
    assert note_id in new_ws_note_ids

    # Fetch notes for default workspace (ID: 1) - should NOT contain this note
    notes_default_ws = client.get("/api/v1/notes", headers={"X-Workspace-Id": "1"})
    assert notes_default_ws.status_code == 200
    default_ws_note_ids = [n["id"] for n in notes_default_ws.json()["data"]]
    assert note_id not in default_ws_note_ids

    # 7. Switch active workspace back to Default Workspace (ID: 1)
    activate_default = client.post("/api/v1/workspaces/1/activate")
    assert activate_default.status_code == 200
    assert activate_default.json()["data"]["id"] == 1

    # 8. Delete the test workspace
    del_res = client.delete(f"/api/v1/workspaces/{new_ws_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Verify deleted workspace is gone
    workspaces_after = client.get("/api/v1/workspaces").json()["data"]
    assert not any(w["id"] == new_ws_id for w in workspaces_after)

    # 9. Verify cannot delete the last active default workspace
    del_default_res = client.delete("/api/v1/workspaces/1")
    assert del_default_res.status_code == 400
