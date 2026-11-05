"""
Admin CLI: reset a user's password directly in the database.

Usage (inside the container):
    python scripts/reset_password.py <email> <new_password>

Options:
    --no-force-reset    Skip setting must_reset_password=True (user won't be
                        prompted to change on next login).

Example:
    docker exec -it ticlasec-api python scripts/reset_password.py admin@example.com TempPass123!
"""

import argparse
from getpass import getpass
import sys

from db.session import get_session
from db.models import User
from api.auth import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset a TiclaSec user password.")
    parser.add_argument("email", help="Email address of the account to reset")
    parser.add_argument(
        "new_password",
        nargs="?",
        help="New password to set. Omit it to use a hidden interactive prompt.",
    )
    parser.add_argument(
        "--new-email",
        help="Optionally rename the account after locating it by its current email.",
    )
    parser.add_argument(
        "--no-force-reset",
        action="store_true",
        dest="no_force_reset",
        help="Do not require the user to change their password on next login",
    )
    args = parser.parse_args()

    email = args.email.lower().strip()
    new_password = args.new_password
    if new_password is None:
        new_password = getpass("New password: ")
        confirmation = getpass("Confirm password: ")
        if new_password != confirmation:
            print("Error: passwords do not match.", file=sys.stderr)
            sys.exit(1)

    if len(new_password) < 8 or not any(c.isalpha() for c in new_password) or not any(c.isdigit() for c in new_password):
        print("Error: password must be at least 8 characters and contain letters and numbers.", file=sys.stderr)
        sys.exit(1)

    with get_session() as session:
        user = session.query(User).filter(User.email == email).first()
        if not user:
            print(f"Error: no user found with email '{email}'.", file=sys.stderr)
            sys.exit(1)

        first = session.query(User).order_by(User.id).first()
        if first.id == user.id:
            user.role = "admin"
        if args.new_email:
            replacement = args.new_email.lower().strip()
            if "@" not in replacement:
                print("Error: --new-email must be a valid email address.", file=sys.stderr)
                sys.exit(1)
            user.email = replacement
        user.hashed_password = hash_password(new_password)
        user.must_reset_password = not args.no_force_reset
        session.commit()

    status = "will be prompted to change it on next login" if not args.no_force_reset else "is set (no forced change)"
    print(f"Password reset for {args.new_email or email}. User {status}.")


if __name__ == "__main__":
    main()
