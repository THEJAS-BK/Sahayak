# Sahayak Web Portal — Police/Admin Portal Design

> Status: **High-level design / draft**
>
> Purpose: Define the pages, navigation, responsibilities, major UI sections, and
> data requirements for the Sahayak **Police Web Portal**.
>
> This document is intentionally a product/UI design reference rather than a
> detailed implementation specification. Exact visual styling can be decided
> during frontend development.

---

# 1. Portal Purpose

The Web Portal is intended for **police/admin users** who need to:

- Monitor assistance requests
- Review and approve/reject volunteer and senior registrations
- Monitor active operations
- View senior citizen locations
- Inspect senior citizen profiles and request history
- Investigate emergency events
- Review system/audit logs

The backend already provides police-specific endpoints for verification,
request monitoring, emergency events, and audit logs.

Relevant existing APIs include:

- `GET /api/verifications`
- `GET /api/verifications/:id`
- `PATCH /api/verifications/:id`
- `GET /api/police/requests`
- `GET /api/police/emergency-events`
- `PATCH /api/police/emergency-events/:id`
- `GET /api/audit-logs`

Every state-changing write is also recorded in `audit_logs`. The API uses
role-based access control and requires an active police user for protected
functionality.

---

# 2. Overall Web Portal Navigation

The portal should use a persistent sidebar/navigation layout.

```text
                         POLICE WEB PORTAL
                                |
        +-----------------------+------------------------+
        |                       |                        |
        v                       v                        v
    Dashboard              Requests                 Monitoring
        |                       |                        |
        |              +--------+--------+               |
        |              |                 |               |
        |              v                 v               |
        |          Accept/Reject     Request Detail      |
        |          Requests             |                |
        |                                |                |
        +--------------------------------+----------------+
                                         |
                                         v
                                       Map
                                         |
                                         v
                                   Senior Profile

        Additional portal sections:

        ├── Dashboard
        ├── Requests
        ├── Monitoring
        ├── Map
        ├── Senior Profiles
        ├── Emergency Events
        └── Audit / Logs
```

A more practical sidebar structure:

```text
┌─────────────────────────────┐
│ SAHAYAK                     │
│ Police Portal               │
├─────────────────────────────┤
│                             │
│  Dashboard                  │
│  Requests                   │
│  Monitoring                 │
│  Map                        │
│  Seniors                    │
│  Emergency Events           │
│  Audit Logs                 │
│                             │
├─────────────────────────────┤
│  Police Profile             │
│  Logout                     │
└─────────────────────────────┘
```

The exact navigation labels can be changed later.

---

# 3. Page Inventory

The initial portal can contain these pages:

| # | Page | Main Purpose |
|---|---|---|
| 1 | Dashboard | High-level overview of the platform |
| 2 | Requests | Review/manage help requests and registrations |
| 3 | Request Detail | Inspect an individual request |
| 4 | Monitoring | Operational real-time request overview |
| 5 | Map | Geographic view of seniors/requests |
| 6 | Senior Profile | View senior information and request history |
| 7 | Emergency Events | Review distress/emergency events |
| 8 | Audit Logs | Inspect system activity and state changes |

---

# 4. Dashboard

## Purpose

The dashboard is the **high-level summary** of what is happening in Sahayak.

The dashboard should answer:

> "What is the current situation across the Sahayak system?"

It should not contain every available piece of information. Detailed operational
information belongs on Monitoring, Requests, Map, and Audit Logs.

---

## 4.1 Proposed Dashboard Layout

```text
┌───────────────────────────────────────────────────────────────┐
│ Dashboard                                  [Today ▼]          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│ │ Open       │ │ Pending    │ │ Active     │ │ Completed  │  │
│ │ Requests   │ │ Requests   │ │ Operations │ │ Requests   │  │
│ │    12      │ │     5      │ │     7      │ │    148     │  │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│                                                               │
│ ┌──────────────────────────────┐ ┌─────────────────────────┐ │
│ │ Request Activity             │ │ Priority Overview        │ │
│ │                              │ │                         │ │
│ │        chart                 │ │ Normal     ███████       │ │
│ │                              │ │ Urgent     ███           │ │
│ └──────────────────────────────┘ └─────────────────────────┘ │
│                                                               │
│ ┌──────────────────────────────┐ ┌─────────────────────────┐ │
│ │ Latest Open Requests         │ │ Recent Activity          │ │
│ │                              │ │                         │ │
│ │ Request #...                 │ │ Volunteer approved      │ │
│ │ Request #...                 │ │ Request accepted        │ │
│ │ Request #...                 │ │ Emergency reviewed      │ │
│ └──────────────────────────────┘ └─────────────────────────┘ │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 4.2 Dashboard Statistics

The initial dashboard should consider these cards:

### Current Request Statistics

- **Open Requests**
- **Pending Requests**
- **Active Operations**
- **Completed Requests**

The exact definition of "open" should be established in the frontend/service
layer. A useful interpretation is:

```text
Open =
PENDING + MATCHING + DISPATCHED + ACCEPTED + IN_PROGRESS
```

The backend state machine currently defines:

```text
PENDING
   ↓
MATCHING
   ↓
DISPATCHED
   ↓
ACCEPTED
   ↓
IN_PROGRESS
   ↓
COMPLETED
```

Other terminal states include:

- `CANCELLED`
- `UNASSIGNED`

---

## 4.3 Additional Dashboard Information

The following can be added without making the dashboard too complicated:

### Request Activity

A small chart showing:

```text
Requests
  ^
  |
  |       ╭─╮
  |   ╭───╯ ╰──╮
  | ╭─╯        ╰─╮
  +--------------------> Time
```

Possible time ranges:

- Today
- Last 7 days
- Last 30 days

### Priority Overview

Show the number of:

- Normal requests
- Urgent requests

### Latest Open Requests

A small list of recently created/open requests:

```text
Latest Open Requests

#REQ-1024   Medical assistance    URGENT
#REQ-1023   Grocery assistance    NORMAL
#REQ-1022   Transport assistance  NORMAL
```

Clicking a request opens Request Detail.

### Recent Activity

Show a small set of recent important events:

- Volunteer approved
- Volunteer rejected
- Request accepted
- Request completed
- Emergency event logged
- Emergency event reviewed

The full history belongs on Audit Logs.

---

# 5. Requests Page

## Purpose

This page is the operational queue for police/admin users.

It should allow the officer to review items requiring attention.

There are two conceptually different queues:

1. **Registration verification**
2. **Help requests**

Because the backend already separates these through `/verifications` and
`/police/requests`, the UI can either keep them as separate tabs or separate
pages.

Recommended structure:

```text
Requests
├── Help Requests
└── Verifications
```

---

# 6. Verification / Accept-Reject Page

## Purpose

Allow police/admin users to review submitted registration forms and
approve/reject them.

This directly corresponds to:

```text
GET   /api/verifications
GET   /api/verifications/:id
PATCH /api/verifications/:id
```

The backend supports:

```text
PENDING
APPROVED
REJECTED
```

---

## 6.1 Verification List

```text
┌──────────────────────────────────────────────────────────────┐
│ Registration Requests                                         │
├──────────────────────────────────────────────────────────────┤
│ [All ▼] [Senior ▼] [Volunteer ▼] [Search...]                 │
├──────────────────────────────────────────────────────────────┤
│ Name          Role          Submitted        Status           │
│──────────────────────────────────────────────────────────────│
│ Ravi Kumar    Volunteer     17 Sep 2026     PENDING          │
│ Anitha Devi   Senior        17 Sep 2026     PENDING          │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 6.2 Verification Detail

Clicking a row opens the submitted form.

For a volunteer:

- Full name
- Phone
- Organization
- Skills
- ID proof reference
- Aadhaar
- Club ID
- Base location

For a senior:

- Full name
- Phone
- Home location
- Preferred language
- Emergency contact
- Aadhaar

The API contract explicitly provides the submitted form through:

`GET /api/verifications/:id`

---

## 6.3 Actions

At the bottom of the verification detail page:

```text
┌──────────────────────────────────────┐
│                                      │
│   [ Reject ]          [ Approve ]    │
│                                      │
└──────────────────────────────────────┘
```

Reject should open a reason dialog:

```text
Reject Registration

Reason:
┌──────────────────────────────────────┐
│                                      │
│                                      │
└──────────────────────────────────────┘

[Cancel]                         [Reject]
```

The backend supports:

```json
{
  "status": "APPROVED | REJECTED",
  "reason": "optional reason"
}
```

Approval creates/activates the corresponding user role and profile.

---

# 7. Request Detail Page

## Purpose

Provide a detailed view of one help request.

Relevant backend endpoint:

```text
GET /api/police/requests
GET /api/requests/:id
```

The police monitoring endpoint returns full request information including
senior name/phone and assigned volunteer.

---

## 7.1 Suggested Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Request #REQ-1024                         [URGENT]           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ STATUS                                                       │
│ DISPATCHED                                                  │
│                                                             │
│ Senior                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Anitha Devi                                             │ │
│ │ Phone: **********                                       │ │
│ │ Location: Shirva                                       │ │
│ │ [View Profile]                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Request                                                     │
│ Category: Medical Assistance                                │
│ Description: ...                                            │
│ Source: Voice Agent                                         │
│ Created: 17 Sep 2026 18:42                                  │
│                                                             │
│ Volunteer                                                   │
│ Assigned: Ravi Kumar                                        │
│                                                             │
│ Request Timeline                                            │
│ PENDING → MATCHING → DISPATCHED → ACCEPTED → ...           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The request detail page should emphasize the **state/timeline** because
`help_requests` has a defined state machine.

---

# 8. Monitoring Page

## Purpose

Monitoring is different from Dashboard.

### Dashboard

Answers:

> "What is happening overall?"

### Monitoring

Answers:

> "What is happening right now?"

Monitoring should therefore focus on **current operational state**.

---

## 8.1 Monitoring Statistics

Suggested cards:

```text
┌───────────────┐
│ Current       │
│ Open Requests │
│      12       │
└───────────────┘

┌───────────────┐
│ Pending       │
│      5        │
└───────────────┘

┌───────────────┐
│ Operational   │
│      7        │
└───────────────┘

┌───────────────┐
│ Unassigned    │
│      2        │
└───────────────┘
```

Where:

```text
Pending:
PENDING / MATCHING

Operational:
ACCEPTED / IN_PROGRESS

Waiting for volunteer:
DISPATCHED

Completed:
COMPLETED
```

The exact grouping should remain configurable because the backend has explicit
request states.

---

## 8.2 Latest Open Requests

Below the statistics:

```text
Latest Open Requests

┌────────┬──────────────┬─────────────┬─────────────┬────────────┐
│ ID     │ Senior       │ Category    │ Status      │ Priority   │
├────────┼──────────────┼─────────────┼─────────────┼────────────┤
│ 1024   │ Anitha       │ Medical     │ IN_PROGRESS │ URGENT     │
│ 1023   │ Ravi         │ Transport   │ DISPATCHED  │ NORMAL     │
│ 1022   │ Lakshmi      │ Grocery     │ PENDING     │ NORMAL     │
└────────┴──────────────┴─────────────┴─────────────┴────────────┘
```

Clicking a request opens Request Detail.

---

## 8.3 Monitoring Filters

Useful filters:

- Status
- Priority
- Category
- Date/time
- Assigned/unassigned
- Senior
- Volunteer

The backend `GET /api/police/requests` already supports:

```text
status?
priority?
from?
to?
limit
cursor?
```

---

## 8.4 Live Updating

The Monitoring page should eventually support live updates.

Possible implementation:

```text
Backend
   |
   | WebSocket / polling
   v
Monitoring Page
   |
   +── Request status changes
   +── New request
   +── Assignment
   +── Completion
   +── Emergency event
```

For the first version, polling can be used if a WebSocket event system has not
yet been implemented.

---

# 9. Map Page

## Purpose

Provide a geographic overview of the Sahayak system.

The map should allow police/admin users to understand:

- Where registered seniors are located
- Where requests are being generated
- Where active assistance is occurring
- Which areas have more requests

---

# 9.1 Map Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Map                                      [Filters ▼]         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │                 ●  ●                                 │  │
│  │            ●               ●                          │  │
│  │                                                       │  │
│  │                       ●                               │  │
│  │             ●                                         │  │
│  │                                                       │  │
│  │       ●                    ●                          │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 9.2 Map Filters

Suggested filters:

### Entity

```text
☑ Senior Citizens
☑ Help Requests
☑ Active Operations
☑ Emergency Events
```

### Request Status

```text
☑ Pending
☑ Matching
☑ Dispatched
☑ Accepted
☑ In Progress
☑ Completed
☑ Unassigned
```

### Priority

```text
☑ Normal
☑ Urgent
```

### Time

```text
Today
Last 7 days
Last 30 days
Custom
```

The filter system should remain extensible.

---

# 9.3 Senior Location Marker

The senior's registered home location is available in:

```text
senior_profiles.home_latitude
senior_profiles.home_longitude
```

A marker can represent a senior.

On hover:

```text
┌──────────────────────────┐
│ Anitha Devi              │
│ 4 requests               │
│ 3 completed              │
│ 1 cancelled              │
└──────────────────────────┘
```

The hover card should remain lightweight.

---

# 9.4 Marker Click

Clicking a senior marker should open a profile preview or navigate to:

```text
/seniors/:id
```

The profile page can then show the complete history.

---

# 9.5 Request Locations

Help requests also contain:

```text
help_requests.latitude
help_requests.longitude
```

Therefore the map can additionally display the **actual request location**.

This is important because a senior's home location and the location where a
help request occurred may not always be the same.

A future version can distinguish:

```text
Senior Home Location
        ●

Request Location
        ◆
```

---

# 10. Senior Profile Page

## Purpose

Show a senior citizen's profile and their historical interaction with Sahayak.

Navigation:

```text
Map marker
    ↓
Senior Profile
```

It can also be reached from a request:

```text
Request Detail
    ↓
View Senior Profile
```

---

## 10.1 Profile Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Senior Profile                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐                                          │
│  │               │   Anitha Devi                            │
│  │    Profile    │   Phone: **********                      │
│  │      Icon     │   Language: Kannada                      │
│  │               │   Location: Shirva                       │
│  └───────────────┘                                          │
│                                                             │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│ │ Requests  │ │ Completed │ │ Cancelled │ │ Emergencies │ │
│ │    12     │ │     9     │ │     2     │ │      1      │ │
│ └───────────┘ └───────────┘ └───────────┘ └─────────────┘ │
│                                                             │
│ Request History                                             │
│                                                             │
│ #1024   Medical     IN_PROGRESS     17 Sep                 │
│ #1008   Grocery     COMPLETED       12 Sep                 │
│ #0981   Transport   COMPLETED       08 Sep                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10.2 Profile Information

Based on `senior_profiles`, the profile can contain:

- Full name
- Phone number
- Preferred language
- Home location
- Emergency contact
- Registration information

Sensitive information such as Aadhaar should **not be unnecessarily displayed**
in general profile views. If it is required for an authorized administrative
workflow, it should have restricted handling.

---

## 10.3 Request Statistics

Useful statistics:

- Total requests
- Completed requests
- Pending/current requests
- Cancelled requests
- Unassigned requests
- Urgent requests

These statistics can be calculated from `help_requests`.

---

## 10.4 Request History

The profile should contain a chronological history:

```text
Request
   ↓
Category
   ↓
Date
   ↓
Priority
   ↓
Status
   ↓
Assigned Volunteer
```

Clicking a request opens Request Detail.

---

# 11. Emergency Events Page

## Purpose

This page should be treated as a separate operational section because an
emergency event is not necessarily dependent on a help request.

The backend explicitly allows emergency events to be logged independently of a
request.

Relevant APIs:

```text
GET   /api/police/emergency-events
PATCH /api/police/emergency-events/:id
```

---

## 11.1 Emergency List

```text
┌─────────────────────────────────────────────────────────────┐
│ Emergency Events                                             │
├─────────────────────────────────────────────────────────────┤
│ [Status ▼] [Trigger ▼] [Date ▼] [Search...]                 │
├─────────────────────────────────────────────────────────────┤
│ Time       Senior       Trigger              Status          │
│─────────────────────────────────────────────────────────────│
│ 18:42      Anitha       acoustic_distress    LOGGED          │
│ 17:21      Ravi         semantic_llm         REVIEWED        │
└─────────────────────────────────────────────────────────────┘
```

Possible trigger types from the backend:

- `semantic_llm`
- `acoustic_distress`
- `keyword_repetition`

---

## 11.2 Emergency Detail

Show:

- Senior
- Trigger type
- Source
- Related help request if present
- Location if available
- Time
- Details
- Escalation to 112
- Review status

Action:

```text
[ Mark as Reviewed ]
```

---

# 12. Audit Logs Page

## Purpose

Audit Logs are different from normal application activity.

The purpose of the audit page is to answer:

> "Who changed what, and when?"

The backend stores:

```text
actor_id
action
entity_type
entity_id
before
after
metadata
created_at
```

Every state-changing write appends an audit log entry in the same transaction.

---

## 12.1 Audit Log Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Audit Logs                                                    │
├──────────────────────────────────────────────────────────────┤
│ [Action ▼] [Entity ▼] [Actor ▼] [Date ▼] [Search...]         │
├──────────────────────────────────────────────────────────────┤
│ Time       Actor       Action             Entity             │
│──────────────────────────────────────────────────────────────│
│ 18:45      Officer A   request.accepted   help_request       │
│ 18:32      Officer B   verification...    user_verification│
│ 18:12      System      dispatch...        help_request       │
└──────────────────────────────────────────────────────────────┘
```

---

## 12.2 Audit Detail

Clicking a log entry can display:

```text
Action:
request.accepted

Actor:
Police Officer / System

Entity:
help_request

Entity ID:
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Timestamp:
17 Sep 2026 18:45

Before:
status = DISPATCHED

After:
status = ACCEPTED

Metadata:
...
```

This is especially useful for debugging, accountability, and investigating
unexpected state changes.

---

# 13. Dashboard vs Monitoring vs Audit

These three pages should have clearly different purposes.

| Page | Question it answers |
|---|---|
| Dashboard | What is the overall situation? |
| Monitoring | What is happening right now? |
| Audit Logs | What happened, who did it, and when? |

Example:

### Dashboard

```text
Open Requests: 12
Active Operations: 7
Completed Today: 18
Urgent Requests: 3
```

### Monitoring

```text
REQ-1024 → IN_PROGRESS → Ravi Kumar
REQ-1023 → DISPATCHED → Waiting for acceptance
REQ-1022 → PENDING → Matching
```

### Audit

```text
18:45 Officer A → request.accepted
18:43 System    → request.dispatched
18:42 Senior    → request.created
```

Keeping these responsibilities separate will make the portal much easier to
understand.

---

# 14. Suggested Dashboard Data Model

The dashboard does not require a new database table initially.

Most dashboard information can be derived from existing data.

## From `help_requests`

Possible aggregates:

```text
COUNT(PENDING)
COUNT(MATCHING)
COUNT(DISPATCHED)
COUNT(ACCEPTED)
COUNT(IN_PROGRESS)
COUNT(COMPLETED)
COUNT(CANCELLED)
COUNT(UNASSIGNED)
```

Also:

```text
COUNT(priority = urgent)
COUNT(priority = normal)
```

And time-based counts:

```text
requests created today
requests completed today
requests created this week
requests completed this week
```

---

# 15. Monitoring Data

Monitoring can primarily use:

```text
GET /api/police/requests
```

The API supports:

```text
status
priority
from
to
limit
cursor
```

This is suitable for the monitoring table and filtering system.

The frontend should avoid downloading an unnecessarily large number of records.
Use the backend's `limit` and `cursor` pagination.

---

# 16. Map Data

The map requires geographic data from the database.

### Senior markers

```text
senior_profiles.home_latitude
senior_profiles.home_longitude
```

### Request markers

```text
help_requests.latitude
help_requests.longitude
```

### Emergency markers

```text
emergency_events.latitude
emergency_events.longitude
```

Emergency event coordinates are nullable, so only events with coordinates can
be shown geographically.

---

# 17. Recommended User Journey for Police Officer

A typical police officer session could look like:

```text
Login
  ↓
Dashboard
  ↓
See "5 Pending Requests"
  ↓
Requests / Verification Queue
  ↓
Open Registration
  ↓
Review Details
  ↓
Approve / Reject
```

Another scenario:

```text
Dashboard
  ↓
Monitoring
  ↓
See urgent IN_PROGRESS request
  ↓
Open Request Detail
  ↓
View Senior
  ↓
Senior Profile
  ↓
View Request History
```

Another scenario:

```text
Dashboard
  ↓
Map
  ↓
Select Senior Location
  ↓
Senior Profile
  ↓
View History
```

Emergency scenario:

```text
Emergency Events
  ↓
Open Event
  ↓
View Senior + Location + Details
  ↓
Mark Reviewed
```

Investigation scenario:

```text
Audit Logs
  ↓
Filter by request ID
  ↓
View complete state-change history
```

---

# 18. Suggested Frontend Route Structure

A possible route structure:

```text
/
├── /login
│
└── /portal
    │
    ├── /dashboard
    │
    ├── /requests
    │   ├── /help
    │   ├── /verifications
    │   └── /:requestId
    │
    ├── /monitoring
    │
    ├── /map
    │
    ├── /seniors
    │   └── /:seniorId
    │
    ├── /emergency-events
    │   └── /:eventId
    │
    └── /audit-logs
```

The exact route naming is flexible.

---

# 19. Frontend Feature Structure

If using the existing feature-oriented frontend organization, a possible
structure is:

```text
web/
└── src/
    ├── features/
    │   ├── auth/
    │   ├── dashboard/
    │   ├── requests/
    │   ├── verifications/
    │   ├── monitoring/
    │   ├── map/
    │   ├── seniors/
    │   ├── emergency-events/
    │   └── audit-logs/
    │
    ├── components/
    │   ├── layout/
    │   ├── sidebar/
    │   ├── header/
    │   ├── cards/
    │   ├── tables/
    │   ├── modals/
    │   └── map/
    │
    ├── routes/
    ├── services/
    ├── hooks/
    ├── lib/
    └── types/
```

This keeps each major portal capability isolated.

---

# 20. MVP Scope

For the first usable version, the portal does **not** need every advanced
feature.

## MVP Pages

### 1. Dashboard

Include:

- Open requests
- Pending requests
- Active operations
- Completed requests
- Latest requests
- Recent activity

### 2. Verification

Include:

- List pending registrations
- Filter by role/status
- View registration details
- Approve
- Reject with reason

### 3. Monitoring

Include:

- Current request counts
- Request table
- Status filters
- Priority filters
- Request detail

### 4. Map

Include:

- Senior locations
- Request locations
- Basic filtering
- Hover information
- Click → Senior Profile

### 5. Senior Profile

Include:

- Basic profile
- Request statistics
- Request history

### 6. Emergency Events

Include:

- Event list
- Event details
- Review action

### 7. Audit Logs

Include:

- Log list
- Filters
- Log detail

---

# 21. Features That Can Come Later

These should not block the initial portal:

- WebSocket-based live monitoring
- Advanced map clustering
- Heatmaps
- Advanced analytics
- Export to CSV/PDF
- Complex date-range analytics
- Notification center
- Detailed volunteer analytics
- Geographic request-density analysis
- Custom dashboard widgets

---

# 22. Important Design Principles

## Keep the Dashboard Simple

The dashboard should summarize, not become another monitoring page.

## Monitoring Should Feel Live

The monitoring page should make it easy for a police officer to identify
requests requiring attention.

## Map Should Be Exploratory

The map is for understanding **where** activity is happening.

## Profile Should Be Historical

The senior profile should answer:

> "Who is this senior and what has their history with Sahayak been?"

## Audit Logs Should Be Technical/Accountability-Focused

Audit logs should answer:

> "What changed, who caused it, and what was the previous/new state?"

## Do Not Duplicate Functionality

For example:

- Dashboard → summary
- Monitoring → current operations
- Requests → detailed queue
- Map → geographic exploration
- Senior Profile → individual history
- Emergency Events → emergency workflow
- Audit Logs → system history

---

# 23. Current High-Level Portal Flow

```text
                           POLICE PORTAL
                                |
                           +----+----+
                           |         |
                           v         v
                       Dashboard   Navigation
                                     |
        +------------+---------------+-------------------+
        |            |               |                   |
        v            v               v                   v
    Requests     Monitoring         Map            Emergency Events
        |            |               |                   |
        |            |               v                   v
        |            |         Senior Profile       Event Detail
        |            |
        |            v
        |       Request Detail
        |
        +----> Verifications
                  |
                  v
             Verification Detail
                  |
             +----+----+
             |         |
             v         v
          Approve    Reject


                    Audit Logs
                        |
                        v
                   Audit Detail
```

---

# 24. Source-of-Truth Relationship With Backend

The frontend should be designed around the backend's existing concepts rather
than inventing a different request lifecycle.

Important backend request states are:

```text
PENDING
MATCHING
DISPATCHED
ACCEPTED
IN_PROGRESS
COMPLETED
CANCELLED
UNASSIGNED
```

The request state machine is the source of truth for valid transitions.

The backend also records state-changing actions in `audit_logs`, while police
users have dedicated endpoints for monitoring requests and reviewing
registrations.

Therefore:

```text
Frontend UI
    ↓
API
    ↓
Business Rules / State Machine
    ↓
PostgreSQL
```

The frontend should display the backend state rather than maintaining an
independent request lifecycle.

---

# 25. Design Summary

The Web Portal should feel like a **police operations dashboard**, not a
generic admin CRUD application.

The core experience is:

```text
                    ┌─────────────┐
                    │  Dashboard  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          v                v                v
     Verify Users      Monitor Requests    Map
          │                │                │
          │                v                v
          │          Request Detail    Senior Profile
          │
          v
      Approve /
       Reject

              ┌───────────────────┐
              │ Emergency Events  │
              └───────────────────┘

              ┌───────────────────┐
              │    Audit Logs     │
              └───────────────────┘
```

The design should prioritize **situational awareness, quick review,
geographic awareness, and traceability**.
