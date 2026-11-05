"""Auth endpoints: login, reset-password, me, logout."""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, status, Request

from api.auth import (
    LoginRequest, LoginResponse, ResetPasswordRequest,
    verify_password, hash_password, create_access_token,
    get_current_user, CurrentUser,
)
from api.rate_limit import rate_limit
from auth.token_blacklist import revoke_token, is_blacklist_configured
from db.models import User, UserMFA
from db.session import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["auth"])

# Per-route limits enforced in-process via the ratelimit substrate (no Redis,
# no slowapi). These are FastAPI dependencies, so the same limiter that the
# global middleware and P4 per-key limits use also guards login/reset.
login_limit = rate_limit(5, 60, scope="login")
reset_limit = rate_limit(3, 60, scope="reset-password")


def validate_password_strength(password: str) -> None:
    """
    Validate password meets minimum requirements.
    Raises ValueError with a user-friendly message.
    """
    if len(password) < 8:
        raise ValueError(
            "Password must be at least 8 characters"
        )
    if len(password) > 128:
        raise ValueError(
            "Password must be under 128 characters"
        )
    # Must have at least one letter and one number
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not has_letter or not has_digit:
        raise ValueError(
            "Password must contain at least one "
            "letter and one number"
        )


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    body: LoginRequest,
    db: Session = Depends(get_db),
    _rl: None = Depends(login_limit),
):
    """
    Authenticate with email + password.
    Returns JWT token.
    """
    user = db.query(User).filter(
        User.email == body.email.lower().strip(),
        User.is_active == True,
    ).first()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    factor = db.query(UserMFA).filter(UserMFA.user_id == user.id).with_for_update().first()
    verified = False
    if factor and factor.enabled:
        from auth.mfa import consume
        try:
            verified = consume(factor, body.otp)
        except Exception:
            raise HTTPException(503, "MFA key unavailable; authentication remains locked")
        if not verified:
            raise HTTPException(401, "Enter a valid authenticator code or unused recovery code")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token, jti = create_access_token(user.id, user.email, mfa_verified=verified)

    return LoginResponse(
        access_token=token,
        must_reset_password=user.must_reset_password,
    )


from pydantic import BaseModel, Field


class MFASetup(BaseModel):
    password: str = Field(max_length=128)


class MFAConfirm(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.get("/mfa")
async def mfa_status(current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    factor = db.get(UserMFA, current.user.id)
    return {"enabled": bool(factor and factor.enabled), "session_verified": current.mfa_verified}


@router.post("/mfa/setup")
async def mfa_setup(body: MFASetup, request: Request, current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db), _rl: None = Depends(reset_limit)):
    if current.user.must_reset_password:
        raise HTTPException(403, "Change the initial password before enrolling MFA")
    if not verify_password(body.password, current.user.hashed_password):
        raise HTTPException(401, "Current password is incorrect")
    # Serialize first enrollment too: a missing factor row cannot be row-locked.
    db.query(User).filter(User.id == current.user.id).with_for_update().one()
    factor = db.query(UserMFA).filter(UserMFA.user_id == current.user.id).with_for_update().first()
    if factor and factor.enabled:
        raise HTTPException(409, "MFA is already enabled; an authenticated recovery process is required to replace it")
    from auth.mfa import cipher, new_secret
    import time
    secret = new_secret()
    try:
        encrypted = cipher().encrypt(secret.encode()).decode()
    except Exception:
        raise HTTPException(503, "Configure the external MFA encryption key before enrollment")
    if not factor:
        factor = UserMFA(user_id=current.user.id)
        db.add(factor)
    factor.encrypted_secret, factor.enabled = encrypted, False
    factor.pending_until, factor.last_counter, factor.recovery_hashes = int(time.time()) + 600, -1, "[]"
    db.commit()
    from urllib.parse import quote
    return {"secret": secret, "uri": f"otpauth://totp/TiclaSec:{quote(current.user.email)}?secret={secret}&issuer=TiclaSec&algorithm=SHA1&digits=6&period=30", "expires_in": 600}


@router.post("/mfa/confirm")
async def mfa_confirm(body: MFAConfirm, request: Request, current: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db), _rl: None = Depends(login_limit)):
    from auth.mfa import consume, recovery_codes
    import time
    factor = db.query(UserMFA).filter(UserMFA.user_id == current.user.id).with_for_update().first()
    if not factor or factor.enabled or factor.pending_until < time.time():
        raise HTTPException(409, "Start a new MFA enrollment")
    try:
        valid = consume(factor, body.code, allow_recovery=False)
    except Exception:
        raise HTTPException(503, "MFA encryption key is unavailable")
    if not valid:
        raise HTTPException(400, "Invalid authenticator code")
    codes, hashes = recovery_codes()
    factor.enabled, factor.recovery_hashes = True, hashes
    db.commit()
    return {"enabled": True, "recovery_codes": codes, "message": "Save these one-use codes offline. Sign in again using the next authenticator code; existing password-only sessions are now rejected."}


@router.post("/reset-password")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
    _rl: None = Depends(reset_limit),
):
    """
    Reset password. Requires valid JWT token.
    Clears must_reset_password flag on success.
    """
    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match",
        )

    try:
        validate_password_strength(body.new_password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not verify_password(body.current_password, current.user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    current.user.hashed_password = hash_password(body.new_password)
    current.user.must_reset_password = False
    db.commit()

    return {"message": "Password updated successfully"}


@router.get("/me")
async def get_me(current: CurrentUser = Depends(get_current_user)):
    """Return current user info. Safe as user is bound to request session."""
    return {
        "id": current.user.id,
        "email": current.user.email,
        "must_reset_password": current.user.must_reset_password,
        "last_login_at": current.user.last_login_at.isoformat() if current.user.last_login_at else None,
    }


@router.post("/logout")
async def logout(
    current: CurrentUser = Depends(get_current_user),
):
    """Logout: revoke the current token."""
    if current.jti and current.exp:
        now = datetime.now(timezone.utc)
        exp = current.exp
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        remaining_seconds = int((exp - now).total_seconds())
        if remaining_seconds > 0:
            success = await revoke_token(current.jti, remaining_seconds)
            # Only surface a hard error when a revocation store is configured
            # (Redis or DB) yet the write failed. With no store configured,
            # logout is best-effort by design and never 503s.
            if not success and is_blacklist_configured():
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Logout failed due to internal token store error",
                )

    return {"message": "Logged out successfully"}
