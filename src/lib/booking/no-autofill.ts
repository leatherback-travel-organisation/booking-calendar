// Guest identity fields are never pre-filled — not by us, not by the
// browser, not by a password manager. A confirmation that reaches the wrong
// person is far worse than a guest typing their own address, so every field
// that says who the guest is opts out of autofill.
//
// `autocomplete="off"` on its own is not enough: browsers ignore it when a
// field's type or label looks like one they know, and extensions ignore it
// outright. These are the opt-outs the major password managers honour.
// Spread onto the input; pair it with the focus guard in ConfirmForm, which
// drops any value that appears without the guest ever touching the field.

export const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": "true", // 1Password
  "data-lpignore": "true", // LastPass
  "data-bwignore": "true", // Bitwarden
  "data-form-type": "other", // Dashlane
} as const;
