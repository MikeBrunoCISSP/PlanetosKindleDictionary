## MODIFIED Requirements

### Requirement: Pending Entries Listing

The Approval Queue SHALL display pending review items — new-entry submissions whose approval status is Pending, and edit proposals whose status is Pending — merged into a single list, ordered by submission time ascending (oldest submitted item first), loaded a bounded page at a time with a stable cursor so that loading further pages neither skips nor duplicates an item even as other Pending items are approved or rejected concurrently. Administrators SHALL be able to load further pages until every currently Pending item has been shown. The queue table SHALL display a Type indicator distinguishing a New Entry item from an Edit item, the item's Headword (rendered as a hyperlink), and Approve/Reject action controls. An item submitted by an administrator and auto-approved at submission time SHALL NOT appear in this listing, since it is never Pending. Each page's size SHALL be capped at a fixed server-enforced maximum.

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

#### Scenario: A page of the merged queue is capped
- **WHEN** more Pending items, combining new-entry submissions and edit proposals, exist than one page's maximum size
- **THEN** only that maximum number are returned in one request, with a way to load the next page, still ordered oldest-first across both item types

#### Scenario: Loading further pages does not skip or duplicate an item across concurrent moderation
- **WHEN** an administrator loads a page, approves or rejects one of the shown items, and then loads the next page
- **THEN** the next page's items are exactly the next-oldest remaining Pending items, with none skipped or repeated
