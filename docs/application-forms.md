# Application forms and submissions

## Tools and access

The module is split into two independent tools:

- `form_builder`: form, bank, field and button configuration.
- `applications`: submitted applications list, detail card, status changes and internal comments.

Both tools use the existing `user_tool_access` checks. Admin users keep automatic access through the existing access service.

## Data flow

1. A form builder creates a form and at least one active bank.
2. The form is published and receives a stable `publicId`.
3. Button configurations generate a lightweight script that inserts the button and calls the public loader only after click.
4. The public loader fetches the form, validates customer input and submits the application.
5. The backend assigns a five-digit application number, saves form value snapshots and product context, then notifies users with `applications` access.

## Realtime

Application updates use the existing SSE pattern:

- Protected stream: `GET /api/applications/stream`
- Event payload includes `eventId`, `timestamp`, `type`, `applicationId`, and minimal state fields.
- The app shell invalidates applications, counts, notifications and chat-message queries so active lists, modals and chat cards refresh from server state.

## Chat links

Applications are shared as internal links:

```text
/tools/applications?application=<application-id>
```

Chat entity resolution happens server-side per viewer. Users without `applications` access receive an unavailable entity payload instead of application data.

## Public scripts

The public loader is served from:

```text
/api/public/application-forms/loader.js
```

Generated button scripts do not call `fetch` or `XMLHttpRequest`; they only insert the button, collect product data from configured selectors, and call the loader on click.
