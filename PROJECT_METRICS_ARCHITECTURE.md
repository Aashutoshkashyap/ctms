# Project Metrics Boundary

`src/lib/projectMetrics.ts` is the shared definition layer for project-control summaries.

- **Contract amount:** the stored project contract amount.
- **Approved variation amount:** `cost_impact_amount` for variation records whose status is `approved`. Submitted claims and EOT/cost claims are not contract value.
- **Revised contract amount:** contract amount plus approved variation amount.
- **Planned progress:** baseline-date progress per activity, aggregated by normalized positive activity weight. Activities with no positive weights use an equal-weight fallback.
- **Actual progress:** actual quantity divided by planned quantity, clamped to 0–100; completed activities are 100. This prevents duplicate daily-work quantities from producing more than 100% progress.
- **Daily expense total:** all daily expenses except rejected records. It is not combined with budget-head actual cost.
- **Budget actual cost:** the sum of `budget_heads.actual_cost`, retained separately for EVM cost performance.
- **Billed amount:** IPC claimed amounts.
- **Certified amount:** IPC certified amounts.
- **Paid amount:** payment transaction rows when present; otherwise the legacy IPC `paid_amount` field.
- **Outstanding amount:** certified less retention, advance recovery, and paid amount; never below zero.

The legacy EVM calculations now consume this boundary. Budget cost, field expenses, and IPC cash flow remain separate monetary streams because the current data model does not establish that they are mutually exclusive.
