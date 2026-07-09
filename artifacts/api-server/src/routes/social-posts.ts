*** Begin Patch
*** Update File: artifacts/api-server/src/routes/social-posts.ts
@@
-import { Router } from "express";
+import { Router } from "express";
@@
- function rowToDto(r: typeof socialPostsTable.$inferSelect) {
+// Drizzle inferred row type for socialPostsTable
+type SocialPostRow = typeof socialPostsTable.$inferSelect;
+
+function rowToDto(r: SocialPostRow) {
@@
-   const rows = await db.select().from(socialPostsTable)
-     .where(eq(socialPostsTable.userId, userId))
-     .orderBy(desc(socialPostsTable.createdAt));
-   res.json(rows.map(rowToDto));
+  const rows = await db.select().from(socialPostsTable)
+    .where(eq(socialPostsTable.userId, userId))
+    .orderBy(desc(socialPostsTable.createdAt));
+  res.json(rows.map((r: SocialPostRow) => rowToDto(r)));
 });
@@
-  const post = await db.select().from(socialPostsTable)
-    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
-    .then(r => r[0]);
+  const post = await db.select().from(socialPostsTable)
+    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
+    .then((r: Array<SocialPostRow>) => r[0]);
@@
-  const post = await db.select().from(socialPostsTable)
-    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
-    .then(r => r[0]);
+  const post = await db.select().from(socialPostsTable)
+    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
+    .then((r: Array<SocialPostRow>) => r[0]);
*** End Patch
