"""User-account storage backed by Google Drive.

Registered-user records are kept in a single JSON file (``users.json``) inside a
dedicated folder on Google Drive.  All Drive access happens server-side; no
credentials or tokens are ever sent to the browser.

Two credential modes are supported (see ``.env``):

* **OAuth (recommended)** - the site owner authorises the app once against their
  own Drive (``setup_drive_auth.py`` writes ``token.json``).  The folder and
  ``users.json`` are created in the owner's Drive so they remain visible/backup-able.
* **Service account** - set ``GOOGLE_SERVICE_ACCOUNT_FILE`` (a key file) or
  ``GOOGLE_SERVICE_ACCOUNT_JSON`` (the key's raw JSON as an env var - preferred on
  hosts like Render where files are ephemeral).  Files are owned by the service
  account instead of a personal Drive.

If neither is configured the module transparently falls back to a local JSON file
so the app still runs in development (a loud warning is logged).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Optional

SCOPES = ["https://www.googleapis.com/auth/drive.file"]

FOLDER_NAME = os.getenv("DRIVE_FOLDER_NAME", "WebsiteUsers")
USERS_FILE_NAME = "users.json"

_lock = threading.RLock()


# --------------------------------------------------------------------------- #
# Credentials
# --------------------------------------------------------------------------- #
def get_credentials():
    """Return Google credentials, or ``None`` when Drive is not configured."""
    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    sa_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")
    token_file = os.getenv("GOOGLE_TOKEN_FILE", "token.json")

    # Service-account key supplied as an env var (preferred on hosts like Render
    # where no persistent file/disk is available).
    if sa_json:
        try:
            from google.oauth2 import service_account
            return service_account.Credentials.from_service_account_info(
                json.loads(sa_json), scopes=SCOPES)
        except Exception:
            logging.exception("Failed to load service-account credentials from env")
            return None

    if sa_file and os.path.exists(sa_file):
        try:
            from google.oauth2 import service_account
            return service_account.Credentials.from_service_account_file(
                sa_file, scopes=SCOPES)
        except Exception:
            logging.exception("Failed to load service-account credentials")
            return None

    if os.path.exists(token_file):
        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
            creds = Credentials.from_authorized_user_file(token_file, SCOPES)
            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
                # Persist the refreshed token.
                with open(token_file, "w") as fh:
                    fh.write(creds.to_json())
            return creds
        except Exception:
            logging.exception("Failed to load/refresh OAuth token")
            return None

    return None


# --------------------------------------------------------------------------- #
# Store interface
# --------------------------------------------------------------------------- #
class UserStore:
    """Minimal interface for reading/writing registered-user records."""

    backend = "abstract"

    def get_user(self, username: str) -> Optional[dict]:
        raise NotImplementedError

    def user_exists(self, username: str) -> bool:
        return self.get_user(username) is not None

    def add_user(self, username: str, email: str, password_hash: str) -> None:
        raise NotImplementedError

    def all_usernames(self) -> list:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Local (development fallback) store
# --------------------------------------------------------------------------- #
class LocalUserStore(UserStore):
    backend = "local"

    def __init__(self, path: str = None):
        self.path = path or os.getenv("USERS_LOCAL_FILE", "users.local.json")

    def _read(self) -> dict:
        if not os.path.exists(self.path):
            return {"users": {}}
        try:
            with open(self.path) as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            logging.exception("Corrupt local user store; resetting")
            return {"users": {}}

    def _write(self, data: dict) -> None:
        with open(self.path, "w") as fh:
            json.dump(data, fh, indent=2)

    def get_user(self, username):
        with _lock:
            return self._read()["users"].get(username)

    def add_user(self, username, email, password_hash):
        with _lock:
            data = self._read()
            if username in data["users"]:
                raise ValueError("User already exists")
            data["users"][username] = {"email": email, "password_hash": password_hash}
            self._write(data)

    def all_usernames(self):
        with _lock:
            return list(self._read()["users"].keys())


# --------------------------------------------------------------------------- #
# Google Drive store
# --------------------------------------------------------------------------- #
class DriveUserStore(UserStore):
    backend = "drive"

    def __init__(self, credentials):
        from googleapiclient.discovery import build
        self.service = build("drive", "v3", credentials=credentials,
                             cache_discovery=False)
        self._folder_id: Optional[str] = None
        self._file_id: Optional[str] = None

    # -- location helpers -------------------------------------------------- #
    def _ensure_folder(self) -> str:
        if self._folder_id:
            return self._folder_id
        folder_id = os.getenv("DRIVE_FOLDER_ID")
        if folder_id:
            self._folder_id = folder_id
            return folder_id
        q = (f"name='{FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' "
             f"and trashed=false")
        found = self.service.files().list(q=q, spaces="drive",
                                          fields="files(id)").execute()
        if found["files"]:
            self._folder_id = found["files"][0]["id"]
        else:
            meta = {"name": FOLDER_NAME,
                    "mimeType": "application/vnd.google-apps.folder"}
            created = self.service.files().create(body=meta,
                                                  fields="id").execute()
            self._folder_id = created["id"]
        return self._folder_id

    def _ensure_file(self) -> str:
        if self._file_id:
            return self._file_id
        folder_id = self._ensure_folder()
        q = (f"name='{USERS_FILE_NAME}' and '{folder_id}' in parents "
             f"and trashed=false")
        found = self.service.files().list(q=q, spaces="drive",
                                          fields="files(id)").execute()
        if found["files"]:
            self._file_id = found["files"][0]["id"]
        else:
            from googleapiclient.http import MediaInMemoryUpload
            media = MediaInMemoryUpload(
                json.dumps({"users": {}}).encode(),
                mimetype="application/json")
            meta = {"name": USERS_FILE_NAME, "parents": [folder_id]}
            created = self.service.files().create(body=meta, media_body=media,
                                                  fields="id").execute()
            self._file_id = created["id"]
        return self._file_id

    # -- read / write ------------------------------------------------------ #
    def _read(self) -> dict:
        file_id = self._ensure_file()
        raw = self.service.files().get_media(fileId=file_id).execute()
        try:
            return json.loads(raw.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            logging.exception("Corrupt Drive user store; resetting")
            return {"users": {}}

    def _write(self, data: dict) -> None:
        from googleapiclient.http import MediaInMemoryUpload
        file_id = self._ensure_file()
        media = MediaInMemoryUpload(json.dumps(data).encode(),
                                    mimetype="application/json")
        self.service.files().update(fileId=file_id, media_body=media,
                                    fields="id").execute()

    # -- interface --------------------------------------------------------- #
    def get_user(self, username):
        with _lock:
            return self._read()["users"].get(username)

    def add_user(self, username, email, password_hash):
        with _lock:
            data = self._read()
            if username in data["users"]:
                raise ValueError("User already exists")
            data["users"][username] = {"email": email, "password_hash": password_hash}
            self._write(data)

    def all_usernames(self):
        with _lock:
            return list(self._read()["users"].keys())


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #
_store: Optional[UserStore] = None


def get_user_store() -> UserStore:
    """Return the configured user store (Drive when available, else local)."""
    global _store
    with _lock:
        if _store is not None:
            return _store
        creds = get_credentials()
        if creds is not None:
            try:
                _store = DriveUserStore(creds)
                logging.info("User store: Google Drive")
                return _store
            except Exception:
                logging.exception("Drive store init failed; falling back to local")
        logging.warning("Google Drive not configured - using LOCAL user store. "
                        "Run setup_drive_auth.py and set GOOGLE_* vars to enable Drive.")
        _store = LocalUserStore()
        return _store
