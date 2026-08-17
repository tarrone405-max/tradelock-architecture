# Module System

Every business capability is a module.

A module can:

Add navigation

Add database tables

Add permissions

Add dashboard widgets

Add API routes

Add templates

Add automations

---

Example

CRM Module

Provides:

Clients

Leads

Pipeline

Contacts

Tasks

---

Projects Module

Provides:

Projects

Tasks

Files

Milestones

Invoices

---

Events Module

Provides:

Events

Venues

Guests

Vendors

Timeline

Contracts

---

Modules can depend on other modules.

Example:

Inventory requires Products.

Scheduling requires Calendar.

Every module should be installable without modifying the rest of the platform.
