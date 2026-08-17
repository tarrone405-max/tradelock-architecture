# Database Philosophy

TradeLock uses an Organization-first database.

Organization

↓

Users

↓

Modules

↓

Permissions

↓

Business Data

Business data includes:

Projects

Clients

Invoices

Files

Inventory

Events

Messages

Reviews

Everything references organization_id.

No business data should belong directly to a user.

This allows:

Teams

Role management

Multiple offices

Future enterprise support

White labeling
