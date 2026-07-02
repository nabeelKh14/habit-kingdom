# Privacy Policy for Habit Kingdom

**Last Updated: July 2, 2026**

## Our Commitment to Children's Privacy

Habit Kingdom is designed for children and families. Protecting children's privacy is our highest priority. We comply with:

- **COPPA** (Children's Online Privacy Protection Act — United States)
- **GDPR-K** (General Data Protection Regulation for children — European Union)
- **CalOPPA** (California Online Privacy Protection Act)

## What Data We Collect

### Account Data
- Parent email address (for account creation and recovery)
- Child's display name (chosen by parent)
- Encrypted authentication tokens

### App Data
- Habit names, schedules, and completion history
- Virtual coins earned and spent
- Avatar/kingdom customization choices
- Reward configurations set by parents

### We DO NOT Collect
- ❌ Precise location data
- ❌ Device identifiers or advertising IDs
- ❌ Photos, videos, or camera access
- ❌ Contacts or address book
- ❌ Browsing history
- ❌ Voice recordings
- ❌ Any data from third-party trackers or analytics SDKs

## How We Use Data

All data is used **exclusively** to provide the app's core functionality:
- Track habit completion and award coins
- Sync data across family devices (with parent consent)
- Send habit reminders (if enabled by parent)
- Display progress and kingdom building

We **never**:
- Sell, rent, or share data with third parties
- Use data for advertising or marketing
- Profile children for behavioral targeting
- Share data with social media platforms

## Parental Controls

Parents have full control:
- Create and manage child profiles
- Set habit schedules and rewards
- Enable/disable notifications
- Review all child activity
- Delete child data at any time

## Data Storage & Security

- Data is encrypted at rest and in transit (AES-256, TLS 1.3)
- Authentication uses industry-standard bcrypt hashing
- Database hosted on Supabase with row-level security
- Regular automated backups with 30-day retention

## Data Deletion

Parents can request complete data deletion at any time:
- In-app: Settings → Parent Controls → Delete Child Data
- Email: privacy@habittracker.app
- The deletion API at `api/v1/child/:profileId/data` permanently removes all associated data within 48 hours

## Third-Party Services

We use only these minimal services:
| Service | Purpose | Data Shared |
|---------|---------|-------------|
| Supabase | Database & Auth | Encrypted user data |
| Sentry | Crash reporting | Anonymous error logs only |

No analytics, advertising, or tracking SDKs are used.

## Parental Consent

Before a child can use Habit Kingdom:
1. A parent must create an account with email verification
2. The parent must complete onboarding, including setting up child profiles
3. Verifiable parental consent is obtained through email OTP verification

## Changes to This Policy

Parents will be notified of any policy changes via email and in-app notice at least 30 days before changes take effect.

## Contact

For privacy questions or data requests:
- Email: privacy@habittracker.app
- Website: https://habittracker.app/privacy

---

*Habit Kingdom is built by parents, for families. We treat your children's data like we treat our own children's — with care, respect, and zero exploitation.*