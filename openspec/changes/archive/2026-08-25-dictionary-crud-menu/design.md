# Design: dictionary-crud-menu

## State Model

The current `AppHeader` state is restructured from two section names to three:

```ts
// Before
openSection: "create" | "update" | "settings" | null
commandOpen: boolean  // Update dictionary selection dialog

// After
openSection: "dictionary" | "settings" | null
commandOpen: boolean              // Update dictionary selection dialog
deleteCommandOpen: boolean        // Delete dictionary selection dialog
deleteTarget: SeriesListItemDto | null  // Drives the confirmation dialog
```

The series list query remains `enabled: commandOpen || deleteCommandOpen` so both selection dialogs share one fetch.

## Menu Structure

```
Dictionaries ▾  (accordion, all authenticated users see the header)
  Create         → navigate to /series/new, close menu          [admin only]
  Update         → open commandOpen selection dialog             [admin only]
  Delete         → open deleteCommandOpen selection dialog       [admin only]
Settings ▾
  Preferences    → navigate to /preferences, close menu
```

Members expand "Dictionaries" and see an empty shelf — consistent with the existing permission-gated section pattern already used by "Create" and "Update".

## Delete Flow (Two-Dialog)

1. Admin clicks "Delete" in the Dictionary shelf → `deleteCommandOpen = true`
2. `CommandDialog` opens titled "Delete Dictionary" — searches and lists all dictionaries
3. Admin selects a dictionary → `deleteCommandOpen = false`, `deleteTarget = selectedItem`
4. When `deleteTarget !== null` a shadcn `Dialog` renders a confirmation:
   > "Are you sure you want to delete **[title]**? This action cannot be undone."
   - Confirm button (destructive variant) → `apiDeleteSeries(slug)`, invalidate `["series", "list"]` query, `deleteTarget = null`
   - Cancel button → `deleteTarget = null`

The two dialogs are independent: closing the selection dialog without a selection (Escape / clicking backdrop) simply sets `deleteCommandOpen = false` and `deleteTarget` stays `null` so the confirmation never opens.

## Route Guard Change

Three pages currently return `{ forbidden: true }` from `beforeLoad` and render an inline 403 page when the user is not an admin. This pattern is replaced with `throw redirect({ to: "/" })`:

```ts
// Remove from all three pages:
if (user.role !== "ADMIN") return { forbidden: true as const };
return { forbidden: false as const };

// Replace with:
if (user.role !== "ADMIN") throw redirect({ to: "/" });
```

The `forbidden` context type, the `useRouteContext()` call in the component, and the conditional 403 render branch are all removed from each file. The `redirect` import comes from `@tanstack/react-router`.

## API Endpoint

```ts
fastify.delete("/api/series/:slug", { preHandler: requireAdmin }, async (request, reply) => {
  const { slug } = request.params as { slug: string };
  try {
    await prisma.series.delete({ where: { slug } });
    return reply.status(204).send();
  } catch (err) {
    if (isPrismaError(err, "P2025")) throw Errors.NOT_FOUND();
    throw err;
  }
});
```

Returns 204 on success, 404 if the slug doesn't exist (P2025), 403 if called by a non-admin (via `requireAdmin` preHandler), 401 if unauthenticated.

## No New Dependencies

All UI components needed (Dialog, CommandDialog, shadcn Button variants) are already present. No database schema changes are required.
