import { PaymentSettingsPanel } from '@/features/payments/PaymentSettingsPanel';

/**
 * Phase 6E — the restaurant manager's own Payout Settings page.
 * These details are used by Thapar Bites to transfer order amounts to the
 * restaurant — they are NOT shown to students at checkout (students always
 * pay Thapar Bites directly via the platform UPI/QR configured by the admin).
 */
export function RestaurantPaymentSettingsScreen() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-xl font-bold text-steel-900">Payout settings</h1>
        <p className="text-sm text-steel-500">
          Thapar Bites transfers each confirmed order to this account. These details are used for
          payouts only and are never shown to students at checkout.
        </p>
      </div>
      <PaymentSettingsPanel
        basePath="/restaurant/payment-settings"
        heading="Your payout account"
        subheading="Thapar Bites uses these details to transfer your earnings after each confirmed order. Students pay Thapar Bites directly — not this account."
      />
    </div>
  );
}
