## Example lifecycle meanings

- `generated`: all expected drafts exist.
- `approved`: all expected drafts are approved.
- `scheduled`: all expected drafts have reached the scheduled delivery stage.
- `attempted`: at least one latest platform delivery attempt exists.
- `partial`: at least one delivery has a verified external receipt and at least one delivery failed, was skipped, or remains unresolved.
- `published`: every expected delivery has a verified external post ID or URL.
- `failed`: no delivery has a verified receipt and every expected delivery has a terminal failure, skip, or receipt-missing result.
