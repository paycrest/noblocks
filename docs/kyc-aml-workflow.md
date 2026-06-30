# KYC/AML Workflow

Noblocks implements a multi-tier KYC (Know Your Customer) and AML (Anti-Money Laundering) verification system combining multiple providers to achieve global compliance while maintaining a smooth user experience.

## Overview

KYC tiers determine transaction limits, verification requirements, and feature access:

| Tier | Requirements | Monthly Limit | Features |
|------|--------------|---------------|----------|
| **0** | Phone only | $0 (no swaps until phone verified) | Browse UI, connect wallet |
| **1** | Phone + Basic ID | $0.50 USD | Limited test transactions |
| **2** | Full ID Verification | $1 USD | Standard onramp access |
| **3** | Enhanced Due Diligence | Tier-specific limit (configurable) | Full access, high-value transfers |

Providers used:
- **SmileID**: Identity verification, liveness detection, document validation
- **Dojah**: Address verification, proof-of-address, utility bill validation
- **KudiSMS/Twilio**: Phone number verification (regional coverage)

## Tier 0: Phone Verification

First step for all users - prevents basic abuse patterns.

### Implementation

```typescript
// POST /api/v1/kyc/phone/request
async function requestPhoneVerification(phoneNumber: string): Promise<void> {
  const country = parseCountryCode(phoneNumber);

  // Choose provider based on region
  if (isAfricanNumber(country)) {
    await kudisms.sendOTP({
      phoneNumber,
      templateCode: process.env.KUDISMS_TEMPLATE_CODE,
      senderId: process.env.KUDISMS_SENDER_ID
    });
  } else {
    await twilio.verify.sendCode({
      serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
      to: phoneNumber
    });
  }

  // Create pending verification record
  await db.kycVerifications.insert({
    userId,
    type: 'PHONE',
    status: 'PENDING',
    phoneNumber,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  });
}

// POST /api/v1/kyc/phone/verify
async function verifyPhoneOTP(phoneNumber: string, code: string): Promise<void> {
  const result = await twilio.verify.verifyCheck({
    serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
    code,
    to: phoneNumber
  });

  if (result.status === 'approved') {
    await markPhoneVerified(userId);
  }
}
```

### Frontend Flow

```tsx
function PhoneVerificationStep() {
  const { requestOTP, verifyCode, error } = usePhoneVerification();

  return (
    <div>
      <h2>Verify Your Phone Number</h2>
      <input type="tel" placeholder="+1 234 567 8900" />
      <button onClick={requestOTP}>Send Code</button>
      <input type="text" placeholder="Enter 6-digit code" />
      <button onClick={verifyCode}>Verify</button>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}
```

## Tier 1: Basic ID Verification

Limited verification for very small transaction caps (primarily testing).

### Requirements

- Valid government-issued ID (passport, driver's license, national ID)
- Selfie/liveness check
- Name matches ID document

### SmileID Integration

```typescript
interface SmileIDRequest {
  url: string;
  project: string;
  params: {
    reference_id: string;
    first_name?: string;
    last_name?: string;
    id_type: 'PASSPORT' | 'DRIVERS_LICENSE' | 'NATIONAL_ID';
    id_number: string;
    country_code: string;
  };
}

async function createSmileIDJob(
  userId: string,
  docType: string,
  docNumber: string,
  countryCode: string
): Promise<string> {
  const jobId = `${userId}_${Date.now()}`;

  const response = await fetch(`${SMILE_IDENTITY_BASE_URL}/v1/idv/job`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${SMILE_IDENTITY_PARTNER_ID}:${SMILE_IDENTITY_API_KEY}`
      ).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      project: SMILE_IDENTITY_PROJECT_ID,
      locale: 'en',
      lang: 'en',
      callback_url: `${API_BASE}/api/v1/kyc/smile-id/callback`,
      data: {
        reference_id: jobId,
        id_type: docType.toUpperCase(),
        id_number: docNumber,
        country_code: countryCode,
        gender: 'MALE', // Optional
        dob: '1990-01-01', // Optional
        first_name: firstName,
        last_name: lastName
      }
    })
  });

  const result = await response.json();
  return result.job_id || result.id;
}
```

### Webhook Handler

```typescript
// POST /api/v1/kyc/smile-id/callback
export async function smileIDCallback(request: Request) {
  const body = await request.json();

  // Parse webhook payload
  const { job_id, state, result, output } = body;

  if (state !== 'completed') {
    return Response.json({ status: 'processing' });
  }

  const isApproved = result === 'approved';

  // Update verification record
  await db.kycVerifications.update(job_id, {
    status: isApproved ? 'VERIFIED' : 'FAILED',
    resultData: output
  });

  if (isApproved) {
    // Promote user to Tier 1
    await upgradeKYCTier(getUserIdByReference(job_id), 1);

    // Trigger welcome notification
    await sendEmail(userEmail, 'kyc-approved', { tier: 1 });
  }

  return Response.json({ status: 'processed' });
}
```

## Tier 2: Full KYC

Complete identity verification for standard transaction limits.

### Additional Requirements

- Liveness detection ( selfie with random pose)
- Document authenticity check ( holograms, fonts, etc.)
- Face match between selfie and ID photo
- Address (optional at this tier)

### Liveness Detection Flow

```tsx
function LivenessCapture() {
  const { startLiveness, captureResult } = useLivenessDetection();

  const handlePose = () => {
    // SmileID offers guided poses: "turn left", "blink", "smile"
    startLiveness({
      challenge_type: 'random_pose',
      max_attempts: 3
    });
  };

  return (
    <div className="liveness-container">
      <VideoStream source={captureResult?.videoSource} />
      <PoseGuide currentPose={captureResult?.currentPose} />
      <button onClick={handlePose}>Start Liveness Check</button>
    </div>
  );
}
```

## Tier 3: Enhanced Verification

High-limit tier requiring additional proof of address and enhanced due diligence.

### Dojah Integration

```typescript
// DOJAH_APP_ID=<app_id>
// DOJAH_SECRET_KEY=<secret_key>
// DOJAH_BASE_URL=https://api.dojah.io

async function requestAddressVerification(
  userId: string,
  utilityBillUrl: string,
  includeBase64Fallback = false
): Promise<string> {
  const jobId = `dojah_${userId}_${Date.now()}`;

  // Try URL submission first (preferred)
  try {
    const response = await fetch(
      `${DOJAH_BASE_URL}/v1/services/address_verification`,
      {
        method: 'POST',
        headers: {
          'x-app-id': DOJAH_APP_ID,
          'x-api-key': DOJAH_SECRET_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input_type: 'utility_bill',
          input_value: utilityBillUrl,
          customer_reference: jobId
        })
      }
    );

    if (response.ok) {
      return jobId;
    }
  } catch (urlError) {
    // Retry with base64 if URL failed (Dojah sometimes can't fetch external URLs)
    if (includeBase64Fallback) {
      const billData = await fetch(utilityBillUrl).then(r => r.blob());
      const base64 = Buffer.from(await billData.arrayBuffer()).toString('base64');

      const fallbackResponse = await fetch(
        `${DOJAH_BASE_URL}/v1/services/address_verification`,
        {
          method: 'POST',
          headers: {
            'x-app-id': DOJAH_APP_ID,
            'x-api-key': DOJAH_SECRET_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input_type: 'utility_bill',
            input_value_base64: base64,
            customer_reference: jobId
          })
        }
      );

      if (fallbackResponse.ok) {
        return jobId;
      }
    }
  }

  throw new Error('Address verification failed');
}
```

### Proof-of-Address Upload

```tsx
function ProofOfAddressUpload() {
  const { uploadFile, result } = useFileUpload();

  const handleSubmit = async (formData: FormData) => {
    const file = formData.get('utilityBill') as File;

    // Upload to Supabase storage first
    const bucket = process.env.KYC_DOCUMENTS_BUCKET;
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(`kyc/${userId}/address-${Date.now()}.pdf`, file);

    if (error) throw error;

    const publicUrl = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;

    // Trigger Dojah verification
    const jobId = await api.post('/kyc/address', {
      utilityBillUrl: publicUrl
    });

    setResult({ jobId, status: 'processing' });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="utilityBill" accept=".pdf,.jpg,.png" type="file" required />
      <button type="submit">Submit for Verification</button>
    </form>
  );
}
```

### Dojah Callback

```typescript
// POST /api/v1/kyc/dojah/callback
export async function dojahCallback(request: Request) {
  const body = await request.json();

  const { customer_reference, status, data } = body;

  if (status === 'success' && data?.is_verified) {
    // Extract address from response
    const extractedAddress = data.extracted_data.address;

    // Verify refund account name matches KYC profile
    const user = await getUserByReference(customer_reference);
    const kycProfile = await getKYCProfile(user.id);

    if (extractedAddress.name !== kycProfile.fullName) {
      throw new ValidationError('Refund account name must match KYC profile');
    }

    // Upgrade to Tier 3
    await upgradeKYCTier(user.id, 3);
    await sendEmail(user.email, 'kyc-tier3-approved', {
      monthlyLimit: getTier3MonthlyLimit()
    });
  }

  return Response.json({ status: 'processed' });
}
```

## State Machine

KYC status transitions:

```
┌─────────┐     phone_verify      ┌─────────┐     id_submit       ┌─────────┐
│ PENDING │ ───────────────────→ │ VERIFY  │ ───────────────────→ │ REVIEW  │
└─────────┘                       └─────────┘                       └────┬────┘
                                                                        │
                    ┌─────────────────┐                                 │ approve
                    ↓                 │                                 ↓
              ┌─────────┐         ┌─────────┐                     ┌─────────┐
              │ FAILED  │ ←───────│ REJECTED│ ←───────────────────│ APPEAL  │
              └─────────┘ reject  └─────────┘ timeout             └────┬────┘
                                                                         │
                                         ┌──────────────────────────────┘
                                         ↓ deny
                                    ┌─────────┐
                                    │ CLOSED  │
                                    └─────────┘
```

## API Routes

### GET /api/v1/kyc/status

Current verification status for logged-in user:

```json
{
  "tier": 2,
  "limits": {
    "monthlyUsd": 1.0,
    "remainingUsd": 0.5
  },
  "verificationStatus": {
    "phone": "verified",
    "id": "verified",
    "address": "pending",
    "pep": "cleared"
  }
}
```

### POST /api/v1/kyc/phone/request

Initiate phone OTP:

```json
{
  "phoneNumber": "+1234567890"
}
```

Response:

```json
{
  "success": true,
  "expiresIn": 600
}
```

### POST /api/v1/kyc/id/submit

Submit ID documents:

```json
{
  "idType": "PASSPORT",
  "idNumber": "P123456789",
  "countryCode": "US",
  "frontImageUrl": "https://...",
  "backImageUrl": "https://..."
}
```

### POST /api/v1/kyc/selfie/upload

Upload selfie for liveness detection:

```json
{
  "selfieImageUrl": "https://...",
  "pose": "FRONT"
}
```

### GET /api/v1/kyc/webhook/smile-id/callback

SmileID webhook endpoint (server-side only):

```json
{
  "job_id": "abc123",
  "state": "completed",
  "result": "approved",
  "output": {
    "first_name": "John",
    "last_name": "Doe",
    "match_score": 0.95
  }
}
```

## Frontend Components

### KYC Progress Tracker

```tsx
function KYCProgress() {
  const { tier, verificationStatus } = useKYCStatus();

  return (
    <div className="kyc-steps">
      <Step
        label="Phone Verification"
        status={verificationStatus.phone === 'verified' ? 'completed' : 'active'}
      />
      <Step
        label="ID Verification"
        status={verificationStatus.id === 'verified' ? 'completed' : 'incomplete'}
      />
      <Step
        label="Proof of Address"
        status={verificationStatus.address === 'verified' ? 'completed' : 'pending'}
      />
    </div>
  );
}

// Step component
function Step({ label, status }: { label: string; status: StepStatus }) {
  return (
    <div className={`step ${status}`}>
      <span className="icon">{getStatusIcon(status)}</span>
      <span className="label">{label}</span>
    </div>
  );
}
```

### KYC Modal

```tsx
function KYCModal({ isOpen, onClose }) {
  const { requiresAction, reason } = useKYCRequirement();

  if (!isOpen || !requiresAction) return null;

  return (
    <Modal title="Identity Verification Required" onClose={onClose}>
      <p>{reason}</p>
      <p>Your current tier allows up to ${getTierLimit()} monthly.</p>
      <button onClick={() => router.push('/kyc/start')}>
        Complete Verification
      </button>
    </Modal>
  );
}
```

## Error Handling

Common KYC rejection reasons:

| Reason | User Message | Resolution |
|--------|--------------|------------|
| `id_expired` | Document expired | Submit valid, unexpired ID |
| `photo_quality` | Image too blurry | Use good lighting, steady hand |
| `name_mismatch` | Name doesn't match | Ensure consistency across documents |
| `face_not_found` | No face detected | Center face in frame, remove glasses/hat |
| `address_invalid` | Utility bill outdated | Provide bill from last 3 months |
| `document_unsupported` | ID type not accepted | Use passport or national ID |

```typescript
function getErrorMessage(code: KYCRejectionReason): string {
  const messages: Record<KYCRejectionReason, string> = {
    id_expired: 'Your ID document has expired. Please submit a valid document.',
    photo_quality: 'The image quality is poor. Please take a clearer photo in good lighting.',
    name_mismatch: 'The name on your ID does not match your profile. Please update your name.',
    face_not_found: 'No face was detected in the selfie. Please ensure your face is clearly visible.',
    address_invalid: 'The provided address document is invalid or outdated.',
    document_unsupported: 'This type of ID is not accepted. Please use a passport or national ID.'
  };

  return messages[code] || 'Verification failed. Please try again or contact support.';
}
```

## Compliance Notes

### Data Retention

- KYC documents retained for 7 years (regulatory requirement)
- Encrypted at rest using AES-256-GCM
- Access limited to compliance team members

### GDPR Rights

Users can request:
- **Access**: Export all KYC data via API
- **Erasure**: Remove non-required data (retention policies may apply)
- **Correction**: Update incorrect personal information

### Audit Logging

All KYC actions logged immutably:

```sql
CREATE TABLE kyc_audit_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Related Documentation

- [Environment Variables](environment-variables.md) – KYC provider configs
- [Fraud Protection](fraud-protection.md) – AML screening integration
- [Authentication](authentication.md) – Auth flow overview
