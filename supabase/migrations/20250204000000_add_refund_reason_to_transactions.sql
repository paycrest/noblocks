-- Add refund_reason column to store cancellation/refund reason from aggregator when status is refunded
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS refund_reason TEXT NULL;

COMMENT ON COLUMN transactions.refund_reason IS 'Reason for refund when status is refunded (from aggregator cancellationReasons)';
