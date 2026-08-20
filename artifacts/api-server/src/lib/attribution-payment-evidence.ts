export type PaymentEvidenceRow = {
  amountCents: number;
  status: string;
  paidAt: Date | null;
};

export function collectedPaymentTotalCents(
  payments: readonly PaymentEvidenceRow[],
): number | null {
  const collected = payments.filter(
    payment => payment.status === "collected" && payment.paidAt instanceof Date && payment.amountCents > 0,
  );
  if (collected.length === 0) return null;
  return collected.reduce((sum, payment) => sum + payment.amountCents, 0);
}
