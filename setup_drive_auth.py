"""One-time Google Drive authorisation helper.

Run this once on the machine that hosts the website:

    python setup_drive_auth.py

It opens a browser so the site owner can grant the app access to their Drive,
then saves ``token.json`` (contains a refresh token) next to this file.  The
token is used server-side by ``drive_storage.py`` and must NEVER be committed
or served to the browser.

Prerequisites (Google Cloud Console):
  1. Create a project and enable the **Google Drive API**.
  2. Create an **OAuth client ID** (type: Desktop app).
  3. Download the credentials as ``client_secrets.json`` into this folder.
"""

import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials

from drive_storage import SCOPES

CLIENT_SECRETS = os.getenv("GOOGLE_CLIENT_SECRETS_FILE", "client_secrets.json")
TOKEN_FILE = os.getenv("GOOGLE_TOKEN_FILE", "token.json")


def main():
    if not os.path.exists(CLIENT_SECRETS):
        sys.exit(
            f"Missing {CLIENT_SECRETS}.\n"
            "Create an OAuth client ID (Desktop app) in Google Cloud Console, "
            "enable the Drive API, and download the JSON here."
        )

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(TOKEN_FILE, "w") as fh:
        fh.write(creds.to_json())

    print(f"\nSuccess. Refresh token saved to {TOKEN_FILE}.")
    print("Keep this file private - it grants access to your Drive folder.")


if __name__ == "__main__":
    main()
