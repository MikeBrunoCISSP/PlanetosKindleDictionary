## MODIFIED Requirements

### Requirement: Pending Entries Listing

The Approval Queue SHALL display all pending review items — new-entry submissions whose approval status is Pending, and edit proposals whose status is Pending — in a single list, ordered by submission time ascending (oldest submitted item first). The queue table SHALL display a Type indicator distinguishing a New Entry item from an Edit item, the item's Headword (rendered as a hyperlink), and Approve/Reject action controls. An item submitted by an administrator and auto-approved at submission time SHALL NOT appear in this listing, since it is never Pending.

#### Scenario: Pending entries shown oldest-first
- **WHEN** an administrator views the Approval Queue and there are both Pending new-entry submissions and Pending edit proposals
- **THEN** they are listed together in a single list, ordered by submission time ascending, oldest first

#### Scenario: Non-pending entries are excluded
- **WHEN** an entry's approval status is Approved or Rejected, or an edit proposal's status is Approved or Rejected
- **THEN** it does not appear in the Approval Queue listing

#### Scenario: Each item's type is visually distinguishable
- **WHEN** an administrator views the Approval Queue
- **THEN** each row makes it clear whether it represents a New Entry submission or an Edit proposal

#### Scenario: Administrator's self-approved submission never enters the queue
- **WHEN** an administrator submits a new entry or an edit, which the system auto-approves immediately
- **THEN** that item never appears in the Approval Queue at any point
