import sys
import uuid
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app
from app.services.auth_service import auth_service

client = TestClient(app)


def test_password_hashing_security():
    """Verify passwords are never stored in plaintext and use PBKDF2-HMAC-SHA256."""
    plain = "SuperSecretPassword123!"
    hashed = auth_service.hash_password(plain)
    
    # Must not contain plain password
    assert plain not in hashed
    assert hashed.startswith("pbkdf2_sha256$100000$")
    
    # Must verify correctly
    assert auth_service.verify_password(plain, hashed) is True
    assert auth_service.verify_password("WrongPassword123!", hashed) is False
    assert auth_service.verify_password("", hashed) is False


def test_tamper_proof_token_verification():
    """Verify tokens signed with HMAC-SHA256 cannot be tampered with."""
    token = auth_service.create_access_token({"sub": "42", "email": "test@offline.local"})
    payload = auth_service.decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "42"

    # Tamper with token header or payload
    parts = token.split(".")
    tampered = f"{parts[0]}.eyJhZG1pbiI6dHJ1ZX0.{parts[2]}"
    assert auth_service.decode_access_token(tampered) is None


def test_user_registration_and_login_flow():
    """Test full registration, duplicate prevention, and login flow."""
    uid = uuid.uuid4().hex[:8]
    test_email = f"alice_{uid}@cognidesk.local"
    test_pwd = "AliceSecurePassword987!"

    # 1. Register Alice
    reg_res = client.post("/api/v1/auth/register", json={
        "email": test_email,
        "password": test_pwd,
        "full_name": "Alice Wonder"
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.json()["data"]
    alice_token = reg_data["token"]
    assert reg_data["user"]["email"] == test_email
    assert reg_data["user"]["full_name"] == "Alice Wonder"
    assert reg_data["user"]["is_guest"] is False

    # 2. Duplicate registration should be rejected with 400
    dup_res = client.post("/api/v1/auth/register", json={
        "email": test_email,
        "password": "AnotherPassword123",
        "full_name": "Alice Duplicate"
    })
    assert dup_res.status_code == 400

    # 3. Login with wrong password should fail with 401
    bad_login = client.post("/api/v1/auth/login", json={
        "email": test_email,
        "password": "WrongPassword!"
    })
    assert bad_login.status_code == 401

    # 4. Login with correct password
    login_res = client.post("/api/v1/auth/login", json={
        "email": test_email,
        "password": test_pwd
    })
    assert login_res.status_code == 200
    login_token = login_res.json()["data"]["token"]
    assert login_token is not None

    # 5. Access /me endpoint with Alice's token
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {alice_token}"})
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == test_email

    # 6. Access /me without token should return 401
    unauth_me = client.get("/api/v1/auth/me")
    assert unauth_me.status_code == 401


def test_guest_mode_and_claiming_workspaces():
    """Verify Guest Mode operates offline and guest workspaces are preserved when converting to full user."""
    uid = uuid.uuid4().hex[:8]
    # 1. Start Guest Session
    guest_res = client.post("/api/v1/auth/guest", json={})
    assert guest_res.status_code == 200
    guest_data = guest_res.json()["data"]
    guest_token = guest_data["token"]
    guest_user = guest_data["user"]
    assert guest_user["is_guest"] is True

    # 2. Guest creates a private workspace
    guest_ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": f"Guest Project {uid}", "category": "Research"},
        headers={"Authorization": f"Bearer {guest_token}"}
    )
    assert guest_ws_res.status_code == 201
    guest_ws_id = guest_ws_res.json()["data"]["id"]

    # 3. Guest adds a note to that workspace
    note_res = client.post(
        "/api/v1/notes",
        json={"title": "Guest Discovery Note", "content": "Valuable research note offline", "workspace_id": guest_ws_id},
        headers={"Authorization": f"Bearer {guest_token}"}
    )
    assert note_res.status_code == 201

    # 4. Guest registers a permanent account and passes guest_token to claim data
    bob_email = f"bob_{uid}@cognidesk.local"
    bob_pwd = "BobSecretPassword123!"
    claim_reg_res = client.post("/api/v1/auth/register", json={
        "email": bob_email,
        "password": bob_pwd,
        "full_name": "Bob Builder",
        "guest_token": guest_token
    })
    assert claim_reg_res.status_code == 201
    bob_token = claim_reg_res.json()["data"]["token"]

    # 5. Verify the guest workspace was transferred to Bob without data loss
    bob_workspaces_res = client.get("/api/v1/workspaces", headers={"Authorization": f"Bearer {bob_token}"})
    assert bob_workspaces_res.status_code == 200
    bob_ws_ids = [w["id"] for w in bob_workspaces_res.json()["data"]]
    assert guest_ws_id in bob_ws_ids

    # Verify Bob can access the note created during guest session
    bob_notes_res = client.get("/api/v1/notes", headers={"Authorization": f"Bearer {bob_token}", "X-Workspace-Id": str(guest_ws_id)})
    assert bob_notes_res.status_code == 200
    assert any(n["title"] == "Guest Discovery Note" for n in bob_notes_res.json()["data"])


def test_cross_user_workspace_and_content_isolation():
    """Verify strict 403 Forbidden on cross-user workspace, document, and note access."""
    uid = uuid.uuid4().hex[:8]
    # Create User Charlie
    charlie_res = client.post("/api/v1/auth/register", json={
        "email": f"charlie_{uid}@cognidesk.local",
        "password": "PasswordCharlie123!",
        "full_name": "Charlie Chaplin"
    })
    charlie_token = charlie_res.json()["data"]["token"]

    # Create User David
    david_res = client.post("/api/v1/auth/register", json={
        "email": f"david_{uid}@cognidesk.local",
        "password": "PasswordDavid123!",
        "full_name": "David Hasselhoff"
    })
    david_token = david_res.json()["data"]["token"]

    # Charlie creates a confidential workspace
    c_ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": f"Charlie Workspace {uid}", "category": "Legal"},
        headers={"Authorization": f"Bearer {charlie_token}"}
    )
    assert c_ws_res.status_code == 201
    charlie_ws_id = c_ws_res.json()["data"]["id"]

    # Charlie creates a note in his workspace
    client.post(
        "/api/v1/notes",
        json={"title": "Charlie Private Note", "content": "Top secret legal strategy", "workspace_id": charlie_ws_id},
        headers={"Authorization": f"Bearer {charlie_token}"}
    )

    # 1. David tries to update Charlie's workspace -> MUST return 403 Forbidden
    david_update_res = client.put(
        f"/api/v1/workspaces/{charlie_ws_id}",
        json={"name": "Hacked Workspace Name"},
        headers={"Authorization": f"Bearer {david_token}"}
    )
    assert david_update_res.status_code == 403

    # 2. David tries to activate Charlie's workspace -> MUST return 403 Forbidden
    david_activate_res = client.post(
        f"/api/v1/workspaces/{charlie_ws_id}/activate",
        headers={"Authorization": f"Bearer {david_token}"}
    )
    assert david_activate_res.status_code == 403

    # 3. David tries to delete Charlie's workspace -> MUST return 403 Forbidden
    david_delete_res = client.delete(
        f"/api/v1/workspaces/{charlie_ws_id}",
        headers={"Authorization": f"Bearer {david_token}"}
    )
    assert david_delete_res.status_code == 403

    # 4. David tries to list notes in Charlie's workspace -> MUST return 403 Forbidden
    david_notes_res = client.get(
        "/api/v1/notes",
        headers={"Authorization": f"Bearer {david_token}", "X-Workspace-Id": str(charlie_ws_id)}
    )
    assert david_notes_res.status_code == 403

    # 5. David tries to create a note in Charlie's workspace -> MUST return 403 Forbidden
    david_create_note_res = client.post(
        "/api/v1/notes",
        json={"title": "David Intruder Note", "content": "I shouldn't be here", "workspace_id": charlie_ws_id},
        headers={"Authorization": f"Bearer {david_token}"}
    )
    assert david_create_note_res.status_code == 403


def test_safe_sqlite_migration_preserves_default_workspace():
    """Verify SQLite migration preserved workspaces, user_id column exists, and active workspace is functional."""
    res = client.get("/api/v1/workspaces")
    assert res.status_code == 200
    workspaces = res.json()["data"]
    assert len(workspaces) >= 1
    # Verify user_id is present on all workspaces (safe schema migration)
    assert all("user_id" in w for w in workspaces)
    # Verify active workspace is available without errors
    active_res = client.get("/api/v1/workspaces/active")
    assert active_res.status_code == 200
    active_ws = active_res.json()["data"]
    assert active_ws is not None
    assert "user_id" in active_ws
