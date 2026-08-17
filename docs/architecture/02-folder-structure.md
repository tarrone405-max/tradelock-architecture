# Folder Structure

TradeLock is divided into two primary systems.

## Core

Core contains infrastructure shared across every business.

Examples:

Authentication

Organizations

Billing

Permissions

Navigation

Dashboard

Storage

Notifications

Core should never contain business-specific logic.

---

## Modules

Modules provide business functionality.

Every module can be enabled or disabled independently.

Examples:

CRM

Projects

Inventory

Events

Automation

Messaging

Templates

AI

Calendar

Billing

Future modules can be added without changing the core platform.

---

## Components

Reusable UI shared throughout TradeLock.

---

## Types

Shared TypeScript interfaces.

---

## Docs

Architecture documentation.

Every developer should read Docs before building features.
