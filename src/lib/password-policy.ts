// Shared by better-auth, the admin user actions and every password form, so it
// stays free of server imports.

/** New passwords (set by an admin, changed or reset by the user) need at least this many characters. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
