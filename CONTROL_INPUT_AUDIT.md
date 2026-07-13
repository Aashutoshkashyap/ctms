# BuildTrack Required Input and Evidence Audit

BuildTrack stores dates as ISO dates for sorting and database integrity, while every user-facing date input and current-date display uses Bikram Sambat (BS).

| Workflow | Primary input role | Required record | Required evidence / approval | Current control |
|---|---|---|---|---|
| BOQ and work schedule | Planning Engineer, Project Manager, Director | BOQ item, work description, BS start, duration, quantity, unit and relationship | Approved baseline or revision document when formally issued | Manual entry, edit, delay remarks and automatic schedule recalculation |
| Daily site report | Field Employee, Site Engineer, Subcontractor | BS report date, weather, people, plant, completed BOQ quantity, rework, materials, delays and next-day plan | Private verification images where required | Own-record controls for field roles; leadership review |
| Daily resources | Site Engineer, Field Employee, Store Officer | BS date, BOQ activity, site, crew, people, equipment hours, fuel, work output and downtime | Meter/output reference or linked photo where required | Fuel/work and excavator-efficiency calculations |
| Daily expense | Employee or finance role | BS date, employee, category, description, amount, payment method and BOQ activity | Invoice/payment slip before approval | Employee ownership plus finance approval and accumulated-date reporting |
| IPC claim | QS, Project Manager or Director | IPC number, billing period, submission date, invoice reference and claimed amount | IPC claim document | Mandatory private file and readiness check |
| IPC certification | Director | Certificate reference/date, certifier, certified amount, retention, advance recovery and remarks | Certificate file | Mandatory certificate file and immutable register fields |
| IPC payment | Accountant or Director | Payment date, amount, tax, method, bank reference, payer and receiving account | Payment proof | Separate partial-payment rows; aggregate maintained by database trigger |
| Variations and claims | QS, Project Manager or Director | Variation item, quantity, cost, previous/new rate, rate difference, event and notice information | Notice, instruction and supporting substantiation | Commercial register and linked document category |
| Procurement | Store Officer, Project Manager or Business Admin | PO, vendor, item, quantity, rate, BS order/delivery date, status and remarks | PO/delivery/GRN document where required | Editable delivery status and inventory event log |
| Inventory | Store Officer | Item, vendor, location, receipt/issue/move quantity and BS event date | Delivery or issue record where required | Event history and reorder status |
| Contract obligation | Project Manager, Director or Business Admin | Clause/reference, obligation, responsible party, category and BS due date | Mandatory compliance/closure file and remarks | Cannot mark complied without private evidence |
| Compliance report | Safety, QA/QC, Design, QS, Site, Project Manager or Director | Reference, type, reporting period, submission/due/expiry dates, issuer and responsible person | Mandatory source file | Dedicated compliance category, linked project record and readiness check |
| QA/QC and NCR | QA/QC Engineer, Project Manager or Director | Inspection/test item, BS dates, result and NCR code for failure | Test/NCR report | Readiness check flags failed records without an NCR/report |
| Safety / EHS | Safety Officer, Project Manager or Director | Safety log, incidents, near misses, permits and complaints | Incident/compliance report when an event exists | Readiness check flags missing report evidence |
| Handover checklist | QA/QC, Project Manager or Director | Deliverable, category, responsible party, requirements and BS due date | Signed/approved evidence plus completion remarks | Authorized staff create the checklist; an item cannot close without private evidence |
| Defects maintenance | Site, QA/QC, Project Manager or Director | Defect, location, BOQ item, responsible team, severity and BS deadline | Source inspection evidence, rectification evidence and final verifier | Two-stage rectify-and-verify workflow with accountable closure |
| Subscription payment | Platform Superadmin | Tenant, payment reference, amount, method, paid date and subscription period | Platform payment reference; optional provider proof metadata | Full transaction history, verify/reject and verify-and-extend action |
| Subscription expiry | Automated platform job | Tenant validity date | Email delivery log and tenant notification | T-5, T-3, T-1 and T-day alerts; queued retry when Gmail is unavailable |

The Compliance & Document Register includes a live readiness panel covering IPC files, contract closure evidence, compliance documents, failed QA/NCR reports, safety incident reports and approved expense slips.
