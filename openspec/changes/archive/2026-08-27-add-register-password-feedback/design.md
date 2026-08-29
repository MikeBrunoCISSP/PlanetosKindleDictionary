## Context

`packages/shared/src/auth.ts`'s `passwordSchema` currently bakes its four rules (min length 8, uppercase, lowercase, digit) directly into a single `.superRefine` with inline regex tests — there's no way for the frontend to ask "which of these does this candidate value currently satisfy?" without re-implementing the same regexes. `RegisterForm` in `apps/web/src/routes/login.tsx` currently validates on submit only (react-hook-form's default mode), via `zodResolver(registerFormSchema)`; the confirm-password match check is `registerFormSchema`'s own `.superRefine`, also submit-triggered.

## Goals / Non-Goals

**Goals:**
- One source of truth for "what are the password rules," shared by the schema's own validation and the new live checklist — no duplicated regexes that could silently drift apart.
- Live (as-you-type) feedback for both the checklist and the confirm-password mismatch, without changing react-hook-form's validation timing for the rest of the form (username/email/reasonForJoining should keep their current on-submit validation behavior).

**Non-Goals:**
- No change to `passwordSchema`'s external validation behavior or error messages — `apps/api` and any other consumer of `passwordSchema` (e.g. reset-password) must see identical accept/reject results before and after this refactor. This is a pure internal restructuring for reuse, verified by the existing `passwordSchema` tests continuing to pass unmodified.
- No change to the `/reset-password` page — the user's request was scoped to the Register screen only; extending the same checklist there is a natural, separate follow-up, not this change.

## Decisions

### 1. Export `passwordRequirements` as an ordered array of `{ id, label, test }`

```ts
export interface PasswordRequirement {
  id: "minLength" | "uppercase" | "lowercase" | "digit";
  label: string;
  test: (value: string) => boolean;
}

export const passwordRequirements: PasswordRequirement[] = [
  { id: "minLength", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "uppercase", label: "At least one uppercase letter (A–Z)", test: (v) => /[A-Z]/.test(v) },
  { id: "lowercase", label: "At least one lowercase letter (a–z)", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "At least one digit (0–9)", test: (v) => /[0-9]/.test(v) },
];
```

`passwordSchema` is rewritten to iterate `passwordRequirements` inside its `.superRefine`, emitting the same issue messages as today (each requirement's `label` reused as the zod issue message, preserving the exact existing text so `apps/api`/`apps/web` error-message-matching tests are unaffected). The frontend checklist imports `passwordRequirements` directly and calls `.test(currentValue)` per item — no parallel regex definitions anywhere.

Alternative considered: keep the regexes only in the checklist component and leave `passwordSchema` as-is. Rejected — that's exactly the duplication this design avoids, and it's what the proposal explicitly calls out as the reason for touching `packages/shared` at all.

### 2. Live values via `useWatch`, decoupled from the form's submit-time validation mode

`RegisterForm` adds `const password = useWatch({ control: form.control, name: "password" })` and the same for `confirmPassword`. The checklist and the mismatch indicator are computed directly from these watched values on every render — they do not go through `form.formState.errors` or `zodResolver` at all. This means:
- No change to `useForm`'s `mode` option — the rest of the Register form's fields keep validating on submit exactly as before.
- The checklist/mismatch UI can't get out of sync with what's on screen, since it's driven by the same values React is already rendering.

Alternative considered: switch the whole form to `mode: "onChange"` so RHF's own error state updates live. Rejected — that would also make username/email/reasonForJoining validate on every keystroke, a behavior change the proposal didn't ask for and that existing scenarios ("Password rule violations shown inline" et al., now superseded, but no other field's timing was in scope) don't cover.

### 3. Confirm-password mismatch: only shown once Confirm Password is non-empty

Matches the existing `registerFormSchema`'s own semantics (empty `confirmPassword` isn't itself flagged as a "mismatch" — it's just incomplete) and avoids showing an error the instant the user tabs into an empty field. The mismatch text/icon appears once `confirmPassword.length > 0 && confirmPassword !== password`, and disappears the moment they're equal (including both empty, which happens transiently while clearing the field).

### 4. Password field's bundled `FormMessage` is removed, others are untouched

Per the proposal, the checklist supersedes the plain-text bundled violation message for the `password` field specifically. `zodResolver`'s validation still runs at submit time (so the API is still protected even if JS is somehow bypassed, and `form.formState.errors.password` still exists) — only the `<FormMessage />` rendering under that one field is dropped, since the checklist already shows the same information more precisely, live. `confirmPassword`'s `FormMessage` is likewise replaced by the live mismatch indicator (same reasoning); every other field keeps its `FormMessage` exactly as today.

## Risks / Trade-offs

- **[Risk]** Rewriting `passwordSchema` internally could accidentally change its accept/reject behavior for some edge-case input → **Mitigation**: the existing `passwordSchema` test suite in `packages/shared/src/__tests__/auth.test.ts` runs unmodified against the refactored implementation as the acceptance check; no test assertions change.
- **[Trade-off]** `useWatch` re-renders `RegisterForm` on every keystroke in the password/confirmPassword fields. Accepted — this is the standard, expected cost of any live-feedback UI and this form has no expensive computation in its render path.
