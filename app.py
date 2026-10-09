"""
Belachew Portfolio — Flask Application
---------------------------------------
Features:
  - Public home page with blog posts
  - Login-protected pages (about, work, contact)
  - User registration + login (hashed passwords)
  - Forgot password / reset password via email (Resend)
  - Session timeouts (idle + absolute lifetime)
  - CSRF protection on all POST forms
  - Per-IP rate limiting on auth + contact
  - Contact form → sends email via Resend HTTPS API
"""

import os
import re
import hmac
import time
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from functools import wraps
from collections import defaultdict, deque

import requests
import resend
from dotenv import load_dotenv
from flask import (
    Flask, render_template, request, session,
    redirect, url_for, abort, flash
)
from werkzeug.security import generate_password_hash, check_password_hash

from drive_storage import get_user_store

# itsdangerous ships with Flask — used for signing reset tokens
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

# ------------------ SETUP ------------------
load_dotenv()
app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)
if not os.getenv("SECRET_KEY"):
    logging.warning(
        "SECRET_KEY not set in environment; using an ephemeral key. "
        "Sessions will not survive restarts."
    )


# ------------------ CONFIG HELPERS ------------------
def _positive_int(name, default):
    """Read a positive integer from env, falling back to default on error."""
    try:
        value = int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


SESSION_LIFETIME_MINUTES = _positive_int("SESSION_LIFETIME_MINUTES", 60)
SESSION_IDLE_MINUTES = _positive_int("SESSION_IDLE_MINUTES", 20)
RESET_TOKEN_MAX_AGE_SECONDS = _positive_int("RESET_TOKEN_MAX_AGE_SECONDS", 1800)  # 30 min

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("FLASK_ENV") == "production",
    PERMANENT_SESSION_LIFETIME=timedelta(minutes=SESSION_LIFETIME_MINUTES),
)

# ------------------ EMAIL (RESEND) ------------------
# Resend sends over HTTPS (port 443) — never blocked by Render's free tier.
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
# This must be a verified sender/domain on Resend.
# For quick testing, Resend lets you use: onboarding@resend.dev
FROM_EMAIL = os.getenv("FROM_EMAIL", "onboarding@resend.dev")
TO_EMAIL = os.getenv("TO_EMAIL", os.getenv("OWN_EMAIL", ""))

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Admin (owner) account
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
_password_hash = os.getenv("ADMIN_PASSWORD_HASH")
if not _password_hash and os.getenv("ADMIN_PASSWORD"):
    _password_hash = generate_password_hash(os.getenv("ADMIN_PASSWORD"))
ADMIN_PASSWORD_HASH = _password_hash

# Input limits & patterns
MAX_MESSAGE_LEN = 5000
MAX_NAME_LEN = 100
MIN_PASSWORD_LEN = 8
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")

# Blog posts (lazy-loaded)
POSTS_URL = "https://api.npoint.io/c790b4d5cab58020d391"
_posts_cache = None


def get_posts():
    """Fetch blog posts once, cache them; never crash startup if the API is down."""
    global _posts_cache
    if _posts_cache is None:
        try:
            resp = requests.get(POSTS_URL, timeout=5)
            resp.raise_for_status()
            _posts_cache = resp.json()
        except (requests.RequestException, ValueError):
            logging.exception("Failed to load blog posts")
            _posts_cache = []
    return _posts_cache


# ------------------ RATE LIMITING ------------------
_hits = defaultdict(deque)


def rate_limit(max_requests, window_seconds, only_methods=("POST",)):
    """In-memory per-IP rate limiter (POST-only by default)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method in only_methods:
                key = f"{fn.__name__}:{request.remote_addr}"
                now = time.monotonic()
                bucket = _hits[key]
                while bucket and now - bucket[0] > window_seconds:
                    bucket.popleft()
                if len(bucket) >= max_requests:
                    abort(429)
                bucket.append(now)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ------------------ CSRF PROTECTION ------------------
def csrf_token():
    """Return (and lazily create) the CSRF token for the current session."""
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(32)
    return session["csrf_token"]


app.jinja_env.globals["csrf_token"] = csrf_token


def validate_csrf():
    """Abort with 400 if the submitted CSRF token is missing or wrong."""
    token = request.form.get("csrf_token", "")
    expected = session.get("csrf_token", "")
    if not expected or not hmac.compare_digest(token, expected):
        abort(400)


# ------------------ HELPERS ------------------
def clean_header(value):
    """Strip CR/LF to prevent email header injection."""
    return re.sub(r"[\r\n]+", " ", value or "").strip()


def send_email(name, email, subject, message):
    """Send the contact-form email via Resend's HTTPS API."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured")
    if not TO_EMAIL:
        raise RuntimeError("TO_EMAIL is not configured")

    safe_name = clean_header(name)
    safe_email = clean_header(email)
    safe_subject = clean_header(subject)[:200] or "No subject"

    body_text = (
        f"Name: {safe_name}\n"
        f"Email: {safe_email}\n\n"
        f"Message:\n{message}"
    )

    params = {
        "from": FROM_EMAIL,
        "to": [TO_EMAIL],
        "reply_to": safe_email,
        "subject": safe_subject,
        "text": body_text,
    }

    try:
        resend.Emails.send(params)
    except Exception as exc:
        raise RuntimeError(f"Resend API failed: {exc}") from exc


def send_password_reset_email(to_email, reset_url):
    """Send the password-reset link via Resend."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured")

    subject = "Reset your password — Belachew Portfolio"
    body_text = (
        "Hello,\n\n"
        "We received a request to reset your password.\n"
        f"Click the link below to choose a new one (valid for {RESET_TOKEN_MAX_AGE_SECONDS // 60} minutes):\n\n"
        f"{reset_url}\n\n"
        "If you didn't request this, you can safely ignore this email — "
        "your password will remain unchanged.\n\n"
        "— Belachew Portfolio"
    )

    params = {
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": subject,
        "text": body_text,
    }

    try:
        resend.Emails.send(params)
    except Exception as exc:
        raise RuntimeError(f"Resend API failed: {exc}") from exc


def login_required(fn):
    """Decorator: allow access only to authenticated users."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper


# ------------------ PASSWORD RESET TOKEN ------------------
def _get_serializer():
    """Create a URLSafeTimedSerializer bound to the app secret."""
    return URLSafeTimedSerializer(app.secret_key, salt="password-reset")


def generate_reset_token(email, fingerprint):
    return _get_serializer().dumps({"email": email, "fp": fingerprint})


def verify_reset_token(token):
    """Return the signed payload for a valid unexpired token, else ``None``."""
    try:
        return _get_serializer().loads(token, max_age=RESET_TOKEN_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None


def _password_fingerprint(record):
    """Stable digest of the stored hash, used to bind a reset token to it."""
    return hashlib.sha256((record.get("password_hash") or "").encode()).hexdigest()[:16]


def _find_user_by_email(store, email):
    """Return ``(username, record)`` for a matching email, else ``(None, None)``."""
    wanted = (email or "").lower()
    for username in store.all_usernames():
        record = store.get_user(username) or {}
        if (record.get("email") or "").lower() == wanted:
            return username, record
    return None, None


# ------------------ PUBLIC ROUTES ------------------
@app.route("/")
def get_all_posts():
    return render_template("index.html", all_posts=get_posts())


@app.route("/about")
@login_required
def about():
    return render_template("about.html")


@app.route("/work")
@login_required
def work():
    return render_template("work.html")


@app.route("/contact", methods=["GET", "POST"])
@login_required
@rate_limit(max_requests=5, window_seconds=300)
def contact():
    if request.method == "POST":
        validate_csrf()

        name = (request.form.get("name") or "").strip()[:MAX_NAME_LEN]
        email = (request.form.get("email") or "").strip()
        subject = (request.form.get("subject") or "No subject").strip()[:200]
        message = (request.form.get("message") or "").strip()[:MAX_MESSAGE_LEN]

        errors = []
        if len(name) < 2:
            errors.append("Please enter your name (min 2 characters).")
        if not EMAIL_RE.match(email):
            errors.append("Please enter a valid email address.")
        if len(message) < 10:
            errors.append("Please enter a message (min 10 characters).")

        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("contact.html", msg_sent=False), 400

        try:
            send_email(name, email, subject, message)
        except Exception:
            logging.exception("Failed to send contact email")
            flash("Could not send your message. Please try again later.", "error")
            return render_template("contact.html", msg_sent=False), 502

        return render_template("contact.html", msg_sent=True)

    return render_template("contact.html", msg_sent=False)


# ------------------ SESSION TIME HELPERS ------------------
def _utc_now():
    return datetime.now(timezone.utc)


def _parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _start_session(username):
    session.clear()
    now = _utc_now().isoformat()
    session["user"] = username
    session["login_time"] = now
    session["last_seen"] = now
    session.permanent = True


@app.before_request
def _enforce_session_timeout():
    """Sign users out after idle time or absolute lifetime."""
    if "user" not in session:
        return

    now = _utc_now()
    login_time = _parse_ts(session.get("login_time"))
    last_seen = _parse_ts(session.get("last_seen"))

    reason = None
    if login_time and now - login_time > timedelta(minutes=SESSION_LIFETIME_MINUTES):
        reason = "Your session has expired. Please log in again."
    elif last_seen and now - last_seen > timedelta(minutes=SESSION_IDLE_MINUTES):
        reason = "You were signed out due to inactivity. Please log in again."

    if reason:
        session.clear()
        flash(reason, "error")
        # Auth pages must stay reachable so an expired user can sign back in
        # (or reset a forgotten password) instead of bouncing off to /login.
        if request.endpoint not in (
            "login", "static", "register", "forgot_password", "reset_password"
        ):
            return redirect(url_for("login"))
        return

    session["last_seen"] = now.isoformat()
    session.permanent = True


# ------------------ AUTH ------------------
def _authenticate(username, password):
    """Check credentials against the Drive/local user store, then the admin env account."""
    store = get_user_store()
    record = store.get_user(username)
    if record and record.get("password_hash"):
        return check_password_hash(record["password_hash"], password)

    if hmac.compare_digest(username, ADMIN_USERNAME) and ADMIN_PASSWORD_HASH:
        return check_password_hash(ADMIN_PASSWORD_HASH, password)

    # Timing equalization when user doesn't exist (avoid enumeration).
    check_password_hash(generate_password_hash("x"), password)
    return False


@app.route("/register", methods=["GET", "POST"])
@rate_limit(max_requests=5, window_seconds=300)
def register():
    if request.method == "POST":
        validate_csrf()
        username = (request.form.get("username") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        errors = []
        if not USERNAME_RE.match(username):
            errors.append("Username must be 3-32 characters (letters, numbers, . _ -).")
        if not EMAIL_RE.match(email):
            errors.append("Please enter a valid email address.")
        if len(password) < MIN_PASSWORD_LEN:
            errors.append(f"Password must be at least {MIN_PASSWORD_LEN} characters.")
        if password != confirm:
            errors.append("Passwords do not match.")

        store = get_user_store()
        if not errors and store.user_exists(username):
            errors.append("That username is already taken.")
        if not errors and _find_user_by_email(store, email)[0]:
            errors.append("An account with that email already exists.")

        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("register.html"), 400

        try:
            store.add_user(username, email, generate_password_hash(password))
        except Exception:
            logging.exception("Failed to register user")
            flash("Could not create your account. Please try again later.", "error")
            return render_template("register.html"), 502

        flash("Account created. You can now log in.", "success")
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
@rate_limit(max_requests=10, window_seconds=300)
def login():
    if request.method == "POST":
        validate_csrf()
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""

        if username and password and _authenticate(username, password):
            _start_session(username)
            return redirect(url_for("get_all_posts"))

        return render_template("login.html", error="Invalid username or password"), 401

    return render_template("login.html", error=None)


@app.route("/logout", methods=["POST"])
def logout():
    validate_csrf()
    session.clear()
    return redirect(url_for("login"))


# ------------------ FORGOT / RESET PASSWORD ------------------
@app.route("/forgot-password", methods=["GET", "POST"])
@rate_limit(max_requests=5, window_seconds=300)
def forgot_password():
    if request.method == "POST":
        validate_csrf()
        email = (request.form.get("email") or "").strip().lower()

        if not EMAIL_RE.match(email):
            flash("Please enter a valid email address.", "error")
            return render_template("forgot_password.html"), 400

        store = get_user_store()
        target_username, record = _find_user_by_email(store, email)

        # If the account exists, generate a token and email the reset link.
        # If it doesn't, silently succeed (avoid user enumeration).
        if target_username:
            token = generate_reset_token(email, _password_fingerprint(record))
            reset_url = url_for("reset_password", token=token, _external=True)
            try:
                send_password_reset_email(email, reset_url)
            except Exception:
                logging.exception("Failed to send password reset email")
                flash(
                    "Could not send the reset email right now. Please try again later.",
                    "error",
                )
                return render_template("forgot_password.html"), 502

        flash(
            "If that email is registered, a password reset link has been sent.",
            "success",
        )
        return redirect(url_for("forgot_password"))

    return render_template("forgot_password.html")


@app.route("/reset-password/<token>", methods=["GET", "POST"])
@rate_limit(max_requests=10, window_seconds=300)
def reset_password(token):
    verified = verify_reset_token(token)
    if not verified:
        flash("The reset link is invalid or has expired. Please request a new one.", "error")
        return redirect(url_for("forgot_password"))

    store = get_user_store()
    target_username, record = _find_user_by_email(store, verified["email"])

    if not target_username:
        flash("Account not found. Please request a new reset link.", "error")
        return redirect(url_for("forgot_password"))

    # The token is bound to the password hash it was minted against, so it dies
    # the moment that password changes. Without this a forwarded link, or one
    # left in browser history, stays replayable for the whole token lifetime.
    if not hmac.compare_digest(verified["fp"], _password_fingerprint(record)):
        flash("This reset link has already been used. Please request a new one.", "error")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        validate_csrf()
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        errors = []
        if len(password) < MIN_PASSWORD_LEN:
            errors.append(f"Password must be at least {MIN_PASSWORD_LEN} characters.")
        if password != confirm:
            errors.append("Passwords do not match.")

        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("reset_password.html", token=token), 400

        try:
            store.update_user_password(target_username, generate_password_hash(password))
        except Exception:
            logging.exception("Failed to update password")
            flash("Could not reset your password. Please try again later.", "error")
            return render_template("reset_password.html", token=token), 502

        flash("Password reset successful. You can now log in.", "success")
        return redirect(url_for("login"))

    return render_template("reset_password.html", token=token)


# ------------------ ERROR HANDLERS ------------------
@app.errorhandler(429)
def too_many_requests(_):
    return render_template(
        "error.html", code=429,
        message="Too many requests. Please slow down."
    ), 429


@app.errorhandler(400)
def bad_request(_):
    return render_template(
        "error.html", code=400,
        message="Bad request."
    ), 400


# ------------------ ENTRY POINT ------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)