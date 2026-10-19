/** Conservative reservation: $0.02 per attempt, including failures, with no refunds. */
export const REQUEST_RESERVATION_MICRO_USD = 20_000;

export class AIBudget {
  private day = "";
  private reserved = 0;
  constructor(private readonly limit: number, private readonly now = () => new Date()) {}
  reserve(): boolean {
    const day = this.now().toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.reserved = 0; }
    if (this.reserved + REQUEST_RESERVATION_MICRO_USD > this.limit) return false;
    this.reserved += REQUEST_RESERVATION_MICRO_USD;
    return true;
  }
  get reservedMicroUsd() { return this.reserved; }
}
