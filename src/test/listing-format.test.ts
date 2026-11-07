import { describe, expect, it } from "vitest";
import { formatPrice } from "@/durrat/lib/listing-format";

describe("two-installment rent price", () => {
  it("shows total and half per installment in Arabic", () => {
    const total = new Intl.NumberFormat("ar-SA").format(30000);
    const half = new Intl.NumberFormat("ar-SA").format(15000);
    expect(formatPrice(30000, "rent", "two_installments", "ar")).toBe(
      `${total} ر.س على دفعتين (${half} ر.س للدفعة الواحدة)`,
    );
  });
});
