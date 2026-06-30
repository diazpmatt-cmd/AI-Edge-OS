---
name: Object Storage wildcard routes
description: Express wildcard route syntax fix for newer path-to-regexp in this project.
---

# Express Wildcard Route Syntax

## Rule
When adding wildcard GET routes in the api-server (Express with newer path-to-regexp v8+), use named wildcards:

```typescript
// WRONG — throws PathError at runtime
router.get("/storage/objects/*", ...)

// CORRECT
router.get("/storage/objects/*objectPath", ...)
// access via req.params["objectPath"]
```

**Why:** path-to-regexp v8 dropped support for unnamed wildcards (`*`). The project uses router@2.x which bundles path-to-regexp@8.x.

**How to apply:** Any time you write a route with `/*`, add a name after the star: `/*name`. Access via `req.params["name"]`.
