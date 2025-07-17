# Notice Banner Configuration

The Noblocks app supports a dynamic notice banner for important announcements or status updates.

## How to Configure

Set the following environment variable in your `.env.local` or deployment environment:

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT='Header|Description...'
```

- Use the pipe character (`|`) to separate the header and description lines.
  - The first part will be the bold header.
  - The second part (optional) will be the description.
- If the variable is not set or is empty, the banner will not be displayed.

### Example

```env
NEXT_PUBLIC_NOTICE_BANNER_TEXT='New feature alert|You can now view your transaction history via the wallet settings.'
```

## Use Cases

- Network status updates
- Maintenance announcements
- Feature launches
- General notifications
