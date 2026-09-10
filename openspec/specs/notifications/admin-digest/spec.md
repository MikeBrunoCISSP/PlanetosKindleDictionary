# admin-digest Specification

## Purpose

Gives administrators a proactive daily summary of work waiting for approval — pending user registrations and pending review-queue items — instead of requiring them to remember to check the admin dashboard.

## Requirements

### Requirement: Daily digest reports pending work counts

On a configured daily schedule, the system SHALL count the number of user registrations pending approval and the number of review-queue items pending approval (new entry submissions plus edit proposals), and SHALL send exactly one summary email reporting both counts to a configured recipient address whenever at least one of the two counts is greater than zero.

#### Scenario: Both pending users and pending edits exist

- **WHEN** the scheduled digest runs and there is at least one pending user registration and at least one pending review-queue item
- **THEN** one digest email is sent to the configured recipient reporting both counts

#### Scenario: Only pending users exist

- **WHEN** the scheduled digest runs and there is at least one pending user registration and zero pending review-queue items
- **THEN** one digest email is sent reporting the pending-user count and zero pending edits

#### Scenario: Only pending edits exist

- **WHEN** the scheduled digest runs and there are zero pending user registrations and at least one pending review-queue item
- **THEN** one digest email is sent reporting zero pending users and the pending-edit count

### Requirement: Digest is silent when there is nothing to review

The system SHALL NOT send a digest email when both the pending-user count and the pending review-queue count are zero.

#### Scenario: Nothing pending

- **WHEN** the scheduled digest runs and there are zero pending user registrations and zero pending review-queue items
- **THEN** no email is sent

### Requirement: Digest schedule is configurable

The digest's send schedule SHALL be controlled by a cron expression supplied through configuration rather than hardcoded, so the schedule can change without a code change.

#### Scenario: Schedule follows configuration

- **WHEN** the configured digest cron expression is changed and the worker restarts
- **THEN** the digest job's next scheduled run follows the newly configured expression

### Requirement: Digest recipient is configured

The digest's destination email address SHALL be supplied through configuration, independent of any other configured recipient address (such as the contact form's), and SHALL be validated as a syntactically valid email address in strict configuration mode.

#### Scenario: Missing recipient fails startup in strict mode

- **WHEN** a process starts in strict configuration mode with no digest recipient address configured
- **THEN** startup validation fails and the process exits non-zero

#### Scenario: Digest recipient is independent of the contact recipient

- **WHEN** the digest recipient and the contact-form recipient are configured to different addresses
- **THEN** the digest email is delivered only to the configured digest recipient

### Requirement: Digest send failures are logged, not fatal

A failure to deliver the digest email SHALL be logged and SHALL NOT crash the worker process or prevent other scheduled jobs from running.

#### Scenario: Delivery failure does not crash the worker

- **WHEN** the scheduled digest run fails to deliver its email
- **THEN** the failure is logged and the worker continues running and processing other jobs
