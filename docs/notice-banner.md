# Notice Banner Component

The Notice Banner component displays important announcements and migration information to users. The banner content is determined by migration mode and environment variables.

## Features

- **Dynamic Content**: Shows different messages based on user type and migration status
- **Environment Variables**: Uses env vars when migration mode is OFF, hardcoded logic when ON
- **Close Button**: Users can dismiss the banner with localStorage persistence
- **Link Support**: Supports markdown-style links `[text](url)` in banner text
- **Bold Text**: Supports bold formatting with `*text*` syntax
- **Responsive Design**: Adapts to mobile and desktop layouts

## Text Formatting

The banner supports markdown-style formatting:

### Bold Text

Use asterisks to make text bold:

```txt
*This text will be bold*
```

### Links

Use markdown link syntax:

```txt
[Click here](https://example.com)
```

### Combined Formatting

You can combine both:

```txt
*Bold text with a [link](https://example.com)*
```

## Link Styling

Links in the banner have the following styling:

- **Default**: Underlined with `underline-offset-2`
- **Hover**: `underline-offset-1` for a subtle animation
- **Target**: Opens in new tab with `target="_blank"`
- **Security**: Includes `rel="noopener noreferrer"`

## Banner Logic

The banner content is determined by the following logic:

### Migration Mode Enabled (`NEXT_PUBLIC_MIGRATION_MODE=true`)

**Legacy Users:**

- **Privy KYC verified, Thirdweb not verified**: Shows migration modal
- **Both KYC verified**: Shows fund transfer reminder or completion message
- **Thirdweb KYC verified, Privy not**: Shows fund transfer reminder or completion message
- **Neither KYC verified**: Shows upgrade announcement

**New Users:**

- Shows welcome message

### Migration Mode Disabled (`NEXT_PUBLIC_MIGRATION_MODE=false`)

**Primary**: Uses environment variables if set:

- `NEXT_PUBLIC_NOTICE_BANNER_TEXT` - Banner text content
- `NEXT_PUBLIC_NOTICE_BANNER_CTA_TEXT` - CTA button text

**Fallback**: If env vars are not set:

- **Legacy Users**: Shows upgrade announcement with link to old site
- **New Users**: Shows welcome message

## Usage Examples

### Legacy User - Migration Required (Migration Mode)

```txt
Migration Required|We're upgrading to a faster, more secure wallet. Complete your migration to continue using Noblocks.
```

### Legacy User - Fund Transfer Reminder

```txt
Fund Transfer Reminder|You have funds in your old wallet that need to be transferred. Access your previous account at [old.noblocks.xyz](https://old.noblocks.xyz)
```

### Legacy User - Upgrade Announcement (No Migration Mode)

```txt
We've upgraded to Thirdweb!|Access your previous account and funds at [old.noblocks.xyz](https://old.noblocks.xyz)
```

### New User - Welcome Message

```txt
Welcome to Noblocks!|Experience faster, more secure crypto-to-fiat conversions powered by Thirdweb.
```

## Props

```typescript
interface NoticeBannerProps {
  textLines: string[];        // Array of text lines (max 2)
  ctaText?: string;          // Call-to-action button text
  onCtaClick?: () => void;   // CTA button click handler
  bannerId?: string;         // Unique ID for localStorage dismissal
}
```

## Environment Variables

The following environment variables are used when migration mode is OFF:

- `NEXT_PUBLIC_NOTICE_BANNER_TEXT` - Banner text content (supports markdown links)
- `NEXT_PUBLIC_NOTICE_BANNER_CTA_TEXT` - CTA button text
- `NEXT_PUBLIC_NOTICE_BANNER_CTA_URL` - URL for CTA button (opens in new tab)

When migration mode is ON, the banner uses hardcoded logic based on user type and KYC status.

## Dismissal

Banners can be dismissed by clicking the X button in the top-right corner. The dismissal is stored in localStorage using the pattern:

```txt
banner-dismissed-{bannerId}
```

This ensures the banner stays dismissed across browser sessions.
