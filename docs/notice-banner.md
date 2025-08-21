# Notice Banner Configuration

The Noblocks app supports a dynamic notice banner for important announcements or status updates. The banner now supports optional CTA buttons for enhanced interactivity.

## How to Configure

Set the following environment variables in your `.env.local` or deployment environment:

```env
# Optional: Notice banner text content
NEXT_PUBLIC_NOTICE_BANNER_TEXT='Header|Description...'

# Optional: CTA button text for notice banner
NEXT_PUBLIC_NOTICE_BANNER_CTA_TEXT='Learn More'

# Optional: CTA button URL for notice banner
NEXT_PUBLIC_NOTICE_BANNER_CTA_URL='https://example.com'

# Optional: Migration mode - if true, CTA opens migration modal instead of URL
NEXT_PUBLIC_MIGRATION_MODE=true
```

- Use the pipe character (`|`) to separate the header and description lines in the banner text.
  - The first part will be the bold header.
  - The second part (optional) will be the description.
- Use asterisks (`*text*`) to make specific words or phrases bold within the text.
- If the banner text variable is not set or is empty, the banner will not be displayed.
- CTA button will appear if CTA text is provided.
- If `NEXT_PUBLIC_MIGRATION_MODE=true`, the CTA will open a migration modal instead of redirecting to a URL.
- If migration mode is false/unset and a URL is provided, the CTA will redirect to the URL.
- If neither migration mode nor URL is configured, the CTA will do nothing.

### Examples

#### Simple Notice Banner

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT='New feature alert|You can now view your transaction history via the wallet settings.'
```

#### Notice Banner with Bold Text

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT='*Important Update*|System maintenance scheduled for *December 15th* from 2-4 AM UTC.'
```

#### Notice Banner with CTA

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT='System Maintenance|Scheduled maintenance will occur on *Dec 15th* from *2-4 AM UTC*.'
NEXT_PUBLIC_NOTICE_BANNER_CTA_TEXT='Learn More'
NEXT_PUBLIC_NOTICE_BANNER_CTA_URL='https://status.noblocks.com'
```

#### Migration Banner

The migration banner uses the migration mode flag to trigger the migration modal when the CTA is clicked.

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT=' |Noblocks is migrating, this is a legacy version that will be closed by *September, 2025*. Click on start migration to move to the new version.'
NEXT_PUBLIC_NOTICE_BANNER_CTA_TEXT='Start migration'
NEXT_PUBLIC_MIGRATION_MODE=true
```

#### Regular Announcement with URL

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT='*New Feature*|Check out our latest payment options!'
NEXT_PUBLIC_NOTICE_BANNER_CTA_TEXT='Explore Now'
NEXT_PUBLIC_NOTICE_BANNER_CTA_URL='https://docs.noblocks.com/features'
NEXT_PUBLIC_MIGRATION_MODE=false
```

## Use Cases

- Network status updates
- Maintenance announcements
- Feature launches
- General notifications
- External link promotions
- Documentation links
