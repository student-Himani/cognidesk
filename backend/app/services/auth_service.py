import base64
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.models.user import User
from app.models.workspace import Workspace

logger = logging.getLogger("app")


class AuthService:
    """
    Offline Authentication & Session Service (Module 28):
    - Zero external cloud dependencies: 100% offline local SQLite auth.
    - OWASP-compliant PBKDF2-HMAC-SHA256 password hashing with unique 16-byte random salts.
    - Tamper-proof HMAC-SHA256 signed access tokens with configurable expiration.
    - Guest Mode: instant offline access with seamless later claiming/conversion to permanent user.
    """

    # --- Password Hashing & Verification ---

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a plaintext password using PBKDF2-HMAC-SHA256 with 100,000 iterations and 16-byte salt."""
        salt = secrets.token_hex(16)
        iterations = 100000
        key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations
        )
        return f"pbkdf2_sha256${iterations}${salt}${key.hex()}"

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against stored PBKDF2 hash using constant-time comparison."""
        try:
            parts = hashed_password.split("$")
            if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
                return False
            iterations = int(parts[1])
            salt = parts[2]
            stored_key_hex = parts[3]

            key = hashlib.pbkdf2_hmac(
                "sha256",
                plain_password.encode("utf-8"),
                salt.encode("utf-8"),
                iterations
            )
            return hmac.compare_digest(key.hex(), stored_key_hex)
        except Exception as e:
            logger.warning(f"Password verification error: {e}")
            return False

    # --- Signed JWT-Style Bearer Tokens ---

    @staticmethod
    def _b64url_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    @staticmethod
    def _b64url_decode(s: str) -> bytes:
        padding = 4 - (len(s) % 4)
        if padding and padding != 4:
            s += "=" * padding
        return base64.urlsafe_b64decode(s.encode("ascii"))

    def create_access_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Generate a signed HMAC-SHA256 tamper-proof token."""
        header = {"alg": "HS256", "typ": "JWT"}
        if expires_delta:
            expire_at = datetime.utcnow() + expires_delta
        else:
            expire_at = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

        payload = data.copy()
        payload.update({
            "exp": int(expire_at.timestamp()),
            "iat": int(datetime.utcnow().timestamp())
        })

        header_b64 = self._b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        payload_b64 = self._b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        signature = hmac.new(settings.SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
        sig_b64 = self._b64url_encode(signature)

        return f"{header_b64}.{payload_b64}.{sig_b64}"

    def decode_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify signature and expiration, returning payload dict or None if invalid."""
        try:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            header_b64, payload_b64, sig_b64 = parts

            # Recompute signature
            signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
            expected_sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
            actual_sig = self._b64url_decode(sig_b64)

            if not hmac.compare_digest(expected_sig, actual_sig):
                return None

            payload = json.loads(self._b64url_decode(payload_b64).decode("utf-8"))
            exp = payload.get("exp")
            if exp and datetime.utcnow().timestamp() > exp:
                return None  # Token expired

            return payload
        except Exception as e:
            logger.debug(f"Token decoding error: {e}")
            return None

    # --- User Operations ---

    def register_user(
        self,
        db: Session,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        guest_token: Optional[str] = None
    ) -> Tuple[User, str]:
        """Register a new persistent user. Automatically migrates guest data if guest_token is provided."""
        clean_email = email.strip().lower()
        if not clean_email or "@" not in clean_email:
            raise ValueError("A valid email address is required.")

        if not password or len(password) < 6:
            raise ValueError("Password must be at least 6 characters long.")

        existing = db.query(User).filter(func.lower(User.email) == clean_email).first()
        if existing and not existing.is_guest:
            raise ValueError(f"An account with email '{clean_email}' already exists.")

        display_name = (full_name or "").strip() or clean_email.split("@")[0].capitalize()
        hashed = self.hash_password(password)

        # Check if we are upgrading an existing guest user in-place
        guest_user = None
        if guest_token:
            payload = self.decode_access_token(guest_token)
            if payload and payload.get("sub"):
                guest_user = db.query(User).filter(User.id == int(payload["sub"]), User.is_guest == True).first()

        if guest_user:
            # Upgrade guest user directly to full user
            guest_user.email = clean_email
            guest_user.full_name = display_name
            guest_user.hashed_password = hashed
            guest_user.is_guest = False
            guest_user.is_active = True
            guest_user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(guest_user)
            user = guest_user
            logger.info(f"Successfully converted Guest user ID {user.id} to registered account: {clean_email}")
        else:
            if existing and existing.is_guest:
                # Re-claim existing guest slot
                existing.email = clean_email
                existing.full_name = display_name
                existing.hashed_password = hashed
                existing.is_guest = False
                existing.is_active = True
                db.commit()
                db.refresh(existing)
                user = existing
            else:
                user = User(
                    email=clean_email,
                    full_name=display_name,
                    hashed_password=hashed,
                    is_guest=False,
                    is_active=True
                )
                db.add(user)
                db.commit()
                db.refresh(user)

        # Ensure user has at least one workspace
        user_ws_count = db.query(Workspace).filter(Workspace.user_id == user.id).count()
        if user_ws_count == 0:
            # Check if there is an unassigned Default Workspace (ID 1)
            unassigned_default = db.query(Workspace).filter(Workspace.id == 1, Workspace.user_id == None).first()
            if unassigned_default:
                unassigned_default.user_id = user.id
                db.commit()
            else:
                new_ws = Workspace(
                    name="Default Workspace",
                    category="General",
                    description="Personal offline workspace",
                    user_id=user.id,
                    is_active=True
                )
                db.add(new_ws)
                db.commit()

        token = self.create_access_token({
            "sub": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_guest": user.is_guest
        })
        return user, token

    def authenticate_user(
        self,
        db: Session,
        email: str,
        password: str,
        guest_token: Optional[str] = None
    ) -> Tuple[User, str]:
        """Authenticate user by email and password. Merges guest data if guest_token is provided."""
        clean_email = email.strip().lower()
        user = db.query(User).filter(func.lower(User.email) == clean_email).first()

        if not user or user.is_guest:
            raise ValueError("Invalid email or password.")

        if not self.verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password.")

        if not user.is_active:
            raise ValueError("Account is currently disabled.")

        # Claim guest workspaces if guest token is passed during login
        if guest_token:
            self.claim_guest_workspaces(db, user, guest_token)

        token = self.create_access_token({
            "sub": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_guest": user.is_guest
        })
        return user, token

    def create_guest_user(self, db: Session, existing_guest_token: Optional[str] = None) -> Tuple[User, str]:
        """Create or resume an offline Guest session. No internet or credentials required."""
        if existing_guest_token:
            payload = self.decode_access_token(existing_guest_token)
            if payload and payload.get("sub"):
                guest_user = db.query(User).filter(User.id == int(payload["sub"]), User.is_guest == True).first()
                if guest_user and guest_user.is_active:
                    # Refresh token and return existing guest
                    token = self.create_access_token({
                        "sub": str(guest_user.id),
                        "email": guest_user.email,
                        "full_name": guest_user.full_name,
                        "is_guest": True
                    })
                    return guest_user, token

        guest_uid = uuid.uuid4().hex[:8]
        guest_email = f"guest_{guest_uid}@offline.local"
        guest_name = f"Guest User"
        guest_password = self.hash_password(secrets.token_hex(20))

        guest = User(
            email=guest_email,
            full_name=guest_name,
            hashed_password=guest_password,
            is_guest=True,
            is_active=True
        )
        db.add(guest)
        db.commit()
        db.refresh(guest)

        # Create initial private workspace for guest
        guest_ws = Workspace(
            name=f"Guest Workspace",
            category="General",
            description="Offline guest workspace. Create an account to permanently save your work.",
            user_id=guest.id,
            is_active=True
        )
        db.add(guest_ws)
        db.commit()

        token = self.create_access_token({
            "sub": str(guest.id),
            "email": guest.email,
            "full_name": guest.full_name,
            "is_guest": True
        })
        logger.info(f"Created new offline Guest session (ID: {guest.id})")
        return guest, token

    def claim_guest_workspaces(self, db: Session, target_user: User, guest_token: str) -> int:
        """Transfer all workspaces, documents, notes, etc. from a guest session into target_user."""
        if not guest_token:
            return 0

        payload = self.decode_access_token(guest_token)
        if not payload or not payload.get("sub"):
            return 0

        guest_id = int(payload["sub"])
        if guest_id == target_user.id:
            return 0

        guest = db.query(User).filter(User.id == guest_id, User.is_guest == True).first()
        if not guest:
            return 0

        # Transfer all workspaces belonging to guest to target_user
        workspaces = db.query(Workspace).filter(Workspace.user_id == guest.id).all()
        count = len(workspaces)
        for ws in workspaces:
            ws.user_id = target_user.id

        # Delete the guest user record
        db.delete(guest)
        db.commit()
        logger.info(f"Migrated {count} workspaces from Guest {guest_id} to User {target_user.id} ({target_user.email})")
        return count

    def get_user_by_id(self, db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()


auth_service = AuthService()
