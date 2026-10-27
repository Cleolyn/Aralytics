# Student accounts and adviser approval

Students sign in through Clerk using Google or email. Every private API verifies the Clerk session and requires a verified primary email address. LRN/name/section login and legacy application JWTs are disabled. A class code is an enrollment invitation, not a login credential.

## Configure Clerk before release

In the Clerk instance used by the client and server:

1. Enable Google OAuth and email sign-in/sign-up. Require email verification at sign-up. Enable email verification codes if you want passwordless email sign-in. Disable phone/username sign-up and other social providers, including Facebook (which was enabled in the existing development instance).
2. Keep student names, LRN, mobile, and section out of required account sign-up fields. These are collected after a valid class code. Google may supply a name automatically.
3. Permit `/sso-callback` as the Google redirect callback, with `/onboarding` after authentication, and register the production origins/redirect URLs in the production Clerk instance.
4. Provision advisers using trusted server-managed Clerk `publicMetadata.role = "TEACHER"` or an existing teacher database record. Public sign-up defaults to student; selecting a role or submitting `role: TEACHER` never grants teacher privileges. Existing database roles take precedence.

The application exposes an explicit Google button plus Clerk's email flow. Other social buttons are hidden as a group; disabling those providers in Clerk also closes their direct provider flows. The server independently rejects unverified primary emails, regardless of client state.

The provider explicitly sets the app's `/login`, `/register`, and `/onboarding` URLs and integrates with React Router. Google uses the current `sso()` API and `/sso-callback` renders `HandleSSOCallback`, which supports Clerk Protect challenges. Required session tasks have dedicated routes under `/auth/tasks/`. Start sign-up inside Aralytics, rather than bookmarking the Clerk hosted `/sign-up/protect-check` page. Keep challenge protection enabled; users must complete any real verification prompt themselves. See [Clerk's challenge requirements](https://clerk.com/docs/react/guides/development/custom-flows/authentication/bot-sign-up-protection).

Clerk references: [email verification configuration](https://clerk.com/docs/react/guides/development/custom-flows/authentication/email-links), [sign-in component](https://clerk.com/docs/react/reference/components/authentication/sign-in).

## Enrollment flow

- An adviser creates an invitation on the teacher dashboard or Classes page, with a school year and one or more section names. The random 10-character code is shown once and stored only as a SHA-256 hash. Copy it when generated. Close an old invitation and generate a new one if needed; approved memberships remain valid.
- A student can create an account without a code. Unenrolled students are routed to `/onboarding` and cannot access learning APIs.
- Code validation reveals only the invitation's adviser, school year, and available sections. It unlocks the LRN, full name, mobile, and section form. The code is validated again at submission, including whether enrollment has closed.
- LRN must be 12 digits. Names support Unicode letters and ordinary name punctuation, up to 150 characters. Mobile accepts Philippine `09…` or `+639…` numbers. The supplied mobile is contact information; it is not verified or used for authentication.
- Requests start as `PENDING`. Students see “Waiting for approval,” the adviser/section/year, instructions to contact their adviser, and a manual status refresh.
- Only the invitation owner can review its requests. Approval writes the verified enrollment details to the student profile and enables class access. Returning a request requires a reason; the student can correct details and submit again using a current code.
- Requests and LRNs are unique. Conflicts require adviser assistance rather than overwriting another student's profile. Account sync cannot change LRN, section, or enrollment status.

## Database and rollout

Server startup creates `class_invitations` and `enrollment_requests` without assigning approvals to existing accounts. Existing students must complete enrollment and receive approval before regaining class access; their learning history is retained. Use the existing Clerk-linked identity for existing records rather than creating duplicate identities with the same email/LRN.

Startup seeds only baseline curriculum and competencies. It does not create demo teachers or students; verified Clerk sign-in provisions application accounts. After a database reset, adviser roles must be present in trusted Clerk public metadata before signing in again.

This first version has one enrollment per student account. School-year rollover, transfers between approved classes, and multiple simultaneous class memberships need a later enrollment-history workflow. Code-attempt throttling is per account and process (15 attempts per 15 minutes); use a shared limiter before scaling to multiple server instances.

## Verification

`npm --prefix server run test:enrollment` uses an isolated in-memory database and a fake identity provider to exercise real HTTP routes, validation, adviser ownership, rejection/resubmission, approval, code closure, and blocked legacy tokens. It does not change live users.

For browser UI checks, run `node client/test/serve-enrollment-preview.mjs`, start the normal client on port 3000, then run `node client/test/enrollment-browser.mjs`. The fixture renders the real enrollment components with isolated identities and mocked API responses. The test checks the actual Google/email login page separately. Screenshots are saved to `.taste-skill/enrollment-qa/`.

Live Google/email delivery and an actual adviser/student session require configured Clerk accounts and are not simulated by the isolated tests.

`npm --prefix client run test:auth` checks account routing, verification requirements, sync failures/timeouts, and token isolation. For complete UI regression coverage, run `node client/test/serve-auth-preview.mjs`, then `node client/test/auth-browser.mjs`. This renders the real application, router, provider configuration, and auth context with an isolated Clerk/API adapter. It covers Google challenge recovery, email verification, pending session tasks, backend failures, enrollment approval, reload, and sign-out without creating live accounts or solving real challenges.
