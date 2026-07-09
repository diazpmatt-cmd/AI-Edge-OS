*** Begin Patch
*** Update File: artifacts/api-server/src/routes/telnyx.ts
@@
-    } catch (e) {
+    } catch (e: any) {
       console.error("[...telnyx...] error", e?.message);
       res.status(500).json({ error: e?.message ?? "Unknown error" });
     }
@@
-  } catch (e) {
+  } catch (e: any) {
     console.warn("[...telnyx...] request failed", e?.message);
     return null;
   }
@@
-  } catch (e) {
+  } catch (e: any) {
     console.warn("[...telnyx...] token refresh failed", e?.message);
   }
@@
-  } catch (e) {
+  } catch (e: any) {
     console.error("[...telnyx...] unexpected error", e?.message);
     res.status(500).json({ error: e?.message ?? "Unknown error" });
   }
@@
-  } catch (e) {
+  } catch (e: any) {
     console.error("[...telnyx...] send error", e?.message);
     res.status(500).json({ error: e?.message ?? "Unknown error" });
   }
*** End Patch
